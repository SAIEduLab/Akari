// Mutants on changed lines (AUDIT.md「変えた行の変異」). Each expression on a changed line of the product script is
// changed in one small way a careless edit makes (a comparison or an operator turned, a condition negated, a constant
// moved by one, a call statement dropped), and the node product suites and the specification worlds that run the line
// are run against it. A mutant that no suite notices shows a change the tests do not pin down.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import cp from 'node:child_process';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {suiteExpression} from './product-test-host.mjs';
import {languageSuiteName} from './node-coverage.mjs';
import {runLanguageInNode} from './language-suite.mjs';
import {snapshotCases, caseBehaviour, runLimited} from './behaviour-snapshot.mjs';
// The specification worlds as a suite: a mutant they run is killed when the record of any world differs from the record
// of the unmutated script (the worlds have no expected values of their own; the base product's record is theirs).
export const worldsSuiteName = 'worlds';
const require = createRequire(import.meta.url);
const {parse} = require('@babel/parser');

const swaps = {'===': '!==', '!==': '===', '==': '!=', '!=': '==', '<': '<=', '<=': '<', '>': '>=', '>=': '>', '+': '-', '-': '+', '*': '/', '/': '*', '&&': '||', '||': '&&'};
const skip = new Set(['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments']);

// [{start, end, replacement, operator}] for the nodes that start inside one of the offset ranges, and for the operators
// that stand inside one (an operator on a changed line of an expression that begins on the line above).
export function mutantsIn(text, ranges) {
  const ast = parse(text, {sourceType: 'script', allowReturnOutsideFunction: true});
  const within = at => ranges.some(([s, e]) => at >= s && at < e), inside = n => within(n.start), out = [];
  const visit = n => {
    if (!n || typeof n.type !== 'string') return;
    if ((n.type === 'BinaryExpression' || n.type === 'LogicalExpression') && swaps[n.operator]) {
      const opAt = text.indexOf(n.operator, n.left.end);
      if (opAt >= 0 && opAt < n.right.start && within(opAt)) out.push({start: opAt, end: opAt + n.operator.length, replacement: swaps[n.operator], operator: n.operator + '->' + swaps[n.operator]});
    }
    if (inside(n)) {
      // Only the ! goes: !(a && b) becomes (a && b).
      if (n.type === 'UnaryExpression' && n.operator === '!') out.push({start: n.start, end: n.start + 1, replacement: '', operator: 'drop !'});
      if (n.type === 'BooleanLiteral') out.push({start: n.start, end: n.end, replacement: String(!n.value), operator: String(n.value) + '->' + String(!n.value)});
      if (n.type === 'NumericLiteral' && Number.isFinite(n.value)) out.push({start: n.start, end: n.end, replacement: '(' + n.value + '+1)', operator: 'n->n+1'});
      if ((n.type === 'IfStatement' || n.type === 'WhileStatement') && n.test) out.push({start: n.test.start, end: n.test.end, replacement: '!(' + text.slice(n.test.start, n.test.end) + ')', operator: 'negate condition'});
      if (n.type === 'ExpressionStatement' && n.expression.type === 'CallExpression') out.push({start: n.start, end: n.end, replacement: 'void 0;', operator: 'drop call'});
    }
    for (const key of Object.keys(n)) { if (skip.has(key)) continue; const v = n[key]; if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v.type === 'string') visit(v); }
  };
  visit(ast.program);
  return out;
}

const contextGlobals = () => ({console: {log() {}, warn() {}, error() {}, info() {}}, TextEncoder, TextDecoder, Uint8Array, Uint32Array, ArrayBuffer, Blob, URL, structuredClone, crypto: crypto.webcrypto, setTimeout, clearTimeout});
// Run in a child process for one mutant (node audit/lib/mutation.mjs --run <script file> <suite>...): exit 3 when a suite
// fails, throws or runs out of time inside the product, so the mutant is killed; exit 0 when every suite passes. Any
// other end of the process (a module that does not load, memory run out) is no answer about the mutant. A process per
// mutant gives its memory back and lets mutants run side by side.
const KILLED = 3;
// The record of every world for one script, each world's record as JSON text.
function worldRecords(script) {
  const context = vm.createContext(contextGlobals());
  vm.runInContext(script, context, {timeout: 30000});
  return Object.fromEntries(snapshotCases().map(c => [c.id, JSON.stringify(caseBehaviour(context.Akari, c))]));
}
async function runOne(scriptFile, suites, recordFile) {
  const script = fs.readFileSync(scriptFile, 'utf8');
  for (const name of suites) {
    try {
      if (name === worldsSuiteName) {
        const expected = JSON.parse(fs.readFileSync(recordFile, 'utf8')), got = worldRecords(script);
        if (Object.keys(expected).some(id => got[id] !== expected[id])) return KILLED;
        continue;
      }
      const context = vm.createContext(contextGlobals());
      vm.runInContext(script, context, {timeout: 30000});
      const report = name === languageSuiteName ? runLanguageInNode(context.Akari) : await vm.runInContext(suiteExpression(name), context, {timeout: 60000});
      if (!report?.results?.length || report.failed) return KILLED;
    } catch { return KILLED; }
  }
  return 0;
}
// node audit/lib/mutation.mjs --run <script file> <world record file> <suite>...; --record <script file> <record file>.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === '--run')
  process.exitCode = await runOne(process.argv[3], process.argv.slice(5), process.argv[4]);
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === '--record')
  fs.writeFileSync(process.argv[4], JSON.stringify(worldRecords(fs.readFileSync(process.argv[3], 'utf8'))));

// 'killed', 'survived', or throws when the run gave no answer. A run still going after 180 seconds is a run the suites
// never finish, so the mutant is killed.
function outcome(scriptFile, suites, recordFile) {
  return new Promise((resolve, reject) => {
    if (!suites.length) { resolve('survived'); return; }
    const child = cp.spawn(process.execPath, [fileURLToPath(import.meta.url), '--run', scriptFile, recordFile, ...suites], {stdio: ['ignore', 'ignore', 'pipe'], env: process.env});
    let stderr = '', timedOut = false;
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 180000);
    child.on('exit', code => {
      clearTimeout(timer);
      if (timedOut || code === KILLED) resolve('killed');
      else if (code === 0) resolve('survived');
      else reject(new Error('a mutant run ended outside the suites (exit ' + code + '): ' + stderr.trim()));
    });
  });
}

// The mutants of the given lines, in a fixed order: the same script and lines give the same list in every process, so
// the parts of the guard (audit/tests/change-guard.mjs --part) each run their own share of one list.
export function mutantPlan({script, shift, lineOffsets, lines, suitesFor}) {
  const jobs = [];
  for (const {file, line, text: source} of lines) {
    const range = lineOffsets(file, line);
    if (!range) continue;
    const [start, end] = range.map(x => x + shift);
    for (const m of mutantsIn(script, [[start, end]])) {
      const mutated = script.slice(0, m.start) + m.replacement + script.slice(m.end);
      try { new vm.Script(mutated); } catch { continue; } // a mutant that does not parse is no test of the tests
      jobs.push({index: jobs.length, file, line, operator: m.operator, source: source.trim(), start: m.start, end: m.end, replacement: m.replacement, suites: suitesFor(file, line)});
    }
  }
  // Two parts that hold the same digest mutate the same script in the same places and run the same suites.
  const digest = crypto.createHash('sha256').update(crypto.createHash('sha256').update(script).digest('hex') + '\u0000' + JSON.stringify(jobs)).digest('hex');
  return {script, jobs, digest};
}
// The mutants of part `index` (1-based) of `count`: every count-th mutant from its own place, so neighbouring mutants of
// one line go to different parts.
export const partJobs = (jobs, index, count) => jobs.filter(job => job.index % count === index - 1);
const bySurvivor = (a, b) => (a.file + a.line + a.operator).localeCompare(b.file + b.line + b.operator);
export const sortSurvivors = survivors => [...survivors].sort(bySurvivor);

// Runs the given mutants of the script and returns the indices of those that survive, in order.
export async function runMutants(script, jobs, parallel = Math.max(1, os.cpus().length - 1)) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akari-mutants-')), survivors = [];
  try {
    // The script as it is passes every suite the mutants use, or a mutant's failing suite says nothing about it (the
    // suites are read from this checkout, the product from the head).
    const control = path.join(dir, 'control.js'), record = path.join(dir, 'worlds.json'), used = [...new Set(jobs.flatMap(job => job.suites))];
    fs.writeFileSync(control, script);
    // The worlds' record of the unmutated script, made the way a mutant run makes its own (the same limit as a mutant).
    if (used.includes(worldsSuiteName)) runLimited([fileURLToPath(import.meta.url), '--record', control, record], 180000, 'the world record of the unmutated product');
    if (await outcome(control, used, record) !== 'survived') throw new Error('the suites the mutants use fail on the unmutated product: ' + used.join(', '));
    let next = 0, failed = false;
    const worker = async () => {
      while (!failed && next < jobs.length) {
        const job = jobs[next], file = path.join(dir, 'mutant-' + next++ + '.js');
        fs.writeFileSync(file, script.slice(0, job.start) + job.replacement + script.slice(job.end));
        let result;
        try { result = await outcome(file, job.suites, record); } catch (error) { failed = true; throw error; }
        if (result === 'survived') survivors.push(job.index);
        fs.rmSync(file, {force: true});
      }
    };
    await Promise.all(Array.from({length: Math.min(parallel, jobs.length)}, worker));
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
  return survivors.sort((a, b) => a - b);
}

// The record of equivalent mutants: {schema, equivalents: [{file, source, operator, reason}]}. Each survivor of this
// change must match an entry of the head's record, and each entry it matches is listed for the owner's label, whether
// this change added it or not (an entry approved once does not cover a line written again later). An entry this change
// adds must match one of its survivors.
export const equivalentsFile = 'audit/manifests/mutation-equivalents.json';
export const equivalentsSchema = 'akari-mutation-equivalents-v1';
export function mutationIssues(survivors, baseRecord, headRecord) {
  const read = record => {
    if (!record) return [];
    if (record.schema !== equivalentsSchema || !Array.isArray(record.equivalents)) throw new Error(equivalentsFile + ' has the wrong shape');
    for (const e of record.equivalents) if (typeof e?.file !== 'string' || typeof e.source !== 'string' || typeof e.operator !== 'string' || typeof e.reason !== 'string' || e.reason.trim().length < 10)
      throw new Error(equivalentsFile + ': each entry names a file, the line text, the operator and a reason');
    return record.equivalents;
  };
  const key = e => [e.file, e.source, e.operator].join('\u0000');
  const head = read(headRecord), before = new Set(read(baseRecord).map(e => key(e) + '\u0000' + e.reason));
  const added = head.filter(e => !before.has(key(e) + '\u0000' + e.reason)), issues = [];
  const surviving = new Set(survivors.map(key)), recorded = new Set(head.map(key));
  for (const s of survivors) if (!recorded.has(key(s))) issues.push('a mutant survives on ' + s.file + ':' + s.line + ' (' + s.operator + '): ' + s.source);
  for (const e of added) if (!surviving.has(key(e))) issues.push(equivalentsFile + ' lists ' + e.file + ' ' + e.operator + ' on "' + e.source + '", but no such mutant survives');
  return {issues, used: head.filter(e => surviving.has(key(e)))};
}
