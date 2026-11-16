// The product's behaviour over fixed works (AUDIT.md「前の版との振る舞いの差分」). Every specification world
// (audit/fixtures/spec-expectations) is built as a work, written back as code and through blocks, checked, and run on a
// fake clock with a fixed random seed; what the work says, where its parts are, its values and its runtime errors are
// recorded. The cases of the assist fixture and the lines of the worlds' scripts are recorded too (assistSnapshot,
// lineSnapshot). The same product gives the same record, so two products that differ in the record behave differently.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import cp from 'node:child_process';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildProject} from './spec-expectations-host.mjs';
import {areas, expectationsRoot} from './spec-expectations.mjs';
import {assistWorld, assistObservation} from './code-assist-host.mjs';

// The node options of a child that runs a product: it reads files but writes only the given files or folders (Node's
// permission model), and starts no process or worker. The product is code of the change under test, and a vm context
// is no boundary: the constructor of a host function given to it reaches the host's process. The coverage run alone
// also has the inspector, which takes the coverage.
export const confined = (writable, {inspector = false} = {}) =>
  ['--permission', '--allow-fs-read=*', ...writable.map(file => '--allow-fs-write=' + file), ...(inspector ? ['--allow-inspector'] : [])];

// Runs node with args to its end, confined to write only the given files, or stops it after limitMs and fails: a child
// still going then never finishes (the change guard runs the product this way, so a product that never returns ends the
// guard with an error).
export function runLimited(args, limitMs, what, writable, options) {
  const r = cp.spawnSync(process.execPath, [...confined(writable, options), ...args], {encoding: 'utf8', timeout: limitMs, maxBuffer: 64 * 1024 * 1024});
  if (r.error?.code === 'ETIMEDOUT' || r.signal) throw new Error(what + ' did not finish within ' + limitMs / 1000 + ' s');
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(what + ' failed (exit ' + r.status + '): ' + (r.stderr || '').trim().slice(-2000));
}
// runLimited without blocking: the children of several products run at the same time. signal stops the child early,
// and the promise then rejects with the AbortError.
export function runLimitedAsync(args, limitMs, what, writable, {signal, ...options} = {}) {
  return new Promise((resolve, reject) => {
    const child = cp.spawn(process.execPath, [...confined(writable, options), ...args], {timeout: limitMs, signal, stdio: ['ignore', 'ignore', 'pipe']});
    let stderr = '', aborted = null;
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', text => { stderr = (stderr + text).slice(-64 * 1024); });
    child.on('error', error => { if (error.name === 'AbortError') aborted = error; else reject(error); });
    child.on('close', (status, killedBy) => {
      if (aborted) reject(aborted);
      else if (killedBy) reject(new Error(what + ' did not finish within ' + limitMs / 1000 + ' s'));
      else if (status !== 0) reject(new Error(what + ' failed (exit ' + status + '): ' + stderr.trim().slice(-2000)));
      else resolve();
    });
  });
}

// The product's API in a fresh context, as the node suites load it. With fixedClock, Date.now in the context always
// reads fixedClockMs, and the context has no performance: the assist stops adding candidates after a time budget it
// reads from that clock, so on the fixed clock its answer does not depend on how fast the machine runs it.
export const fixedClockMs = 0;
export function productApi(html, {fixedClock = false} = {}) {
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  const context = vm.createContext({console, TextEncoder, TextDecoder, Uint8Array, Uint32Array, ArrayBuffer, Blob, URL, structuredClone, crypto: crypto.webcrypto, setTimeout, clearTimeout});
  if (fixedClock) vm.runInContext('Date.now = () => ' + fixedClockMs + ';', context);
  vm.runInContext(script, context, {timeout: 30000});
  return context.Akari;
}
// The context the assist cases are recorded in, on the fixed clock.
export const fixedClockApi = html => productApi(html, {fixedClock: true});

export function snapshotCases(root = path.resolve(expectationsRoot, '../../..')) {
  const cases = [];
  for (const area of areas)
    for (const c of JSON.parse(fs.readFileSync(path.join(root, 'audit/fixtures/spec-expectations', area, 'cases.json'), 'utf8')).cases)
      if (c.world) cases.push({id: area + '/' + c.id, world: c.world, inputs: c.inputs ?? [], untilMs: c.run?.untilMs ?? 3000, stepMs: c.run?.stepMs ?? 10});
  return cases;
}

const plain = v => v && typeof v === 'object' && 'magnitude' in v ? [v.magnitude, v.unit] : v && typeof v === 'object' && 'part' in v ? 'part:' + v.name : v;
const strip = v => JSON.parse(JSON.stringify(v, (key, value) => key === 'sourceSpan' ? undefined : value));

function fakeAudio(clock) {
  let serial = 0;
  const active = new Map(), begin = (seconds, onEnded) => { const id = 'audio-' + ++serial; active.set(id, {id, endAt: clock() + seconds * 1000, onEnded}); return id; };
  return {activeAudioHandles: active, getImage: () => null, setPaused() {},
    startTone: (_frequency, seconds, _volume, _pitch, onEnded = null) => begin(seconds, onEnded),
    startSample: (buffer, _volume, pitch, onEnded = null) => begin(buffer.duration / Math.pow(2, pitch / 12), onEnded),
    getAudioBuffer: () => ({duration: 1}),
    stopHandle(id, {notify = true} = {}) { const h = active.get(id); if (!h) return; active.delete(id); if (notify) h.onEnded?.(id); },
    stopAllHandles({notify = true} = {}) { for (const id of [...active.keys()]) this.stopHandle(id, {notify}); },
    advance(time) { for (const h of [...active.values()]) if (h.endAt <= time) { active.delete(h.id); h.onEnded?.(h.id); } }};
}

export function caseBehaviour(api, c) {
  const record = {};
  try {
    const {project, ids, refusals} = buildProject(api, c.world);
    record.refusals = refusals.map(x => x.code + '@' + x.line);
    const each = fn => project.scripts.map(s => { try { return fn(s); } catch (e) { return 'E:' + (e.code ?? e.name); } });
    record.formatted = each(s => api.formatScript(api.parseSyntax(s.source).ast));
    record.blocks = each(s => api.formatScript(api.blockDecode(api.blockEncode(api.parseSyntax(s.source).ast).tree)));
    const compiled = api.compileProject(project);
    record.errors = compiled.errors.map(e => [e.code, e.line, e.message]);
    if (compiled.errors.length || refusals.length) return strip(record);
    let now = 0, answer = null;
    const speech = [], samples = [], audio = fakeAudio(() => now);
    const r = new api.RuntimeModel(project, {}, audio);
    r.reset(12345);
    const nameOf = id => project.components.find(x => x.id === r.actor(id)?.baseId)?.name ?? id;
    const q = new api.EventScheduler(project, compiled, r, {say: (id, text) => speech.push([nameOf(id), String(text), now]), ask: (_question, callback) => { answer = callback; }});
    r.now = () => now; q.schedule = () => {};
    const inputs = [...c.inputs].sort((a, b) => a.atMs - b.atMs);
    try {
      q.start();
      for (now = 0; now <= c.untilMs; now += c.stepMs) {
        audio.advance(now);
        while (inputs.length && inputs[0].atMs <= now) {
          const i = inputs.shift();
          if (i.answer !== undefined && answer) { const done = answer; answer = null; done(i.answer); }
          else if (i.key !== undefined) { q.setKeyState(i.key, true); q.spawnDistributed('keyDown', {key: i.key}); }
          else if (i.click !== undefined) q.spawnForRuntime(ids.get(i.click), 'click', {});
          else if (i.signal !== undefined) q.spawnDistributed('message', {message: i.signal});
        }
        q.recheckBlocked();
        for (let n = 0; n < 500 && q.ready.length; n++) q.runTurn();
        q.recheckBlocked();
        if (now % 100 === 0) samples.push([now, project.components.map(x => { const a = r.actor(x.id); return a ? [x.name, a.x, a.y, a.direction, a.scalePercent, a.visible] : [x.name]; }),
          [...r.projectVars].map(([k, v]) => [k, plain(v)]), [...r.projectLists].map(([k, v]) => [k, v.map(plain)])]);
      }
      Object.assign(record, {speech, samples, runtimeErrors: q.errorRecords.map(x => x.code), tasks: q.tasks.size});
    } finally { q.stop(); }
  } catch (error) { record.exception = String(error.code ?? error.name) + ': ' + String(error.message).slice(0, 200); }
  return strip(record);
}

// A page with no Akari API (a synthetic test product) runs nothing: that is its behaviour in every case.
const unavailable = ids => Object.fromEntries(ids.map(id => [id, {unavailable: 'the page has no Akari API'}]));
const loaded = (html, load) => { try { const api = load(html); return api?.makeEmptyProject ? api : null; } catch { return null; } };
const failure = error => String(error?.code ?? error?.name ?? 'Error');

export function behaviourSnapshot(html, cases) {
  const api = loaded(html, productApi);
  if (!api) return unavailable(cases.map(c => c.id));
  return Object.fromEntries(cases.map(c => [c.id, caseBehaviour(api, c)]));
}

// Every case of the assist fixture (audit/fixtures/assist/code-assist-cases.json) as assist/<its id>: what the assist
// answers there (assistObservation, audit/lib/code-assist-host.mjs) in the project its world builds, on the fixed clock.
// A case that throws is recorded by the name of what it throws.
export const assistCases = fixture => fixture.cases.map(test => 'assist/' + test.id);
export function assistSnapshot(html, fixture) {
  const api = loaded(html, fixedClockApi), ids = assistCases(fixture);
  if (new Set(ids).size !== ids.length) throw new Error('the assist fixture names a case twice');
  if (!api) return unavailable(ids);
  return Object.fromEntries(fixture.cases.map((test, i) => {
    try { return [ids[i], assistObservation(api, assistWorld(api, test.world), test)]; } catch (error) { return [ids[i], {exception: failure(error)}]; }
  }));
}

// The distinct non-empty lines of the scripts of the specification worlds, with their indentation.
export function worldLines(cases) {
  const lines = new Set();
  for (const c of cases) for (const s of c.world.scripts ?? []) for (const line of String(s.source ?? '').split('\n')) if (line.trim()) lines.add(line);
  return [...lines];
}
// Every line of worldLines as line/ and the first 16 hex digits of the sha256 of its text: all api.parseSyntax returns
// for the line alone on the fixed clock, as plain JSON (the tree with its source positions, and every diagnostic whole).
// A line whose parse throws is recorded by the name of what it throws.
export const lineCase = line => 'line/' + crypto.createHash('sha256').update(line).digest('hex').slice(0, 16);
export function lineSnapshot(html, lines) {
  const api = loaded(html, fixedClockApi), ids = lines.map(lineCase);
  if (new Set(ids).size !== ids.length) throw new Error('two lines of the specification worlds have one case name');
  if (!api) return unavailable(ids);
  return Object.fromEntries(lines.map((line, i) => [ids[i], lineParse(api, line)]));
}
function lineParse(api, line) {
  try { return JSON.parse(JSON.stringify(api.parseSyntax(line))); } catch (error) { return {exception: failure(error)}; }
}

// A record of a product in a child process (node audit/lib/behaviour-snapshot.mjs <kind> <page> [<fixture>] <record>),
// stopped after limitMs, or when signal aborts.
async function boundedRecord(kind, what, html, fixture, limitMs, signal) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akari-snapshot-'));
  try {
    const page = path.join(dir, 'page.html'), record = path.join(dir, 'record.json'), inputs = [page];
    fs.writeFileSync(page, html);
    if (fixture) { inputs.push(path.join(dir, 'fixture.json')); fs.writeFileSync(inputs[1], JSON.stringify(fixture)); }
    await runLimitedAsync([fileURLToPath(import.meta.url), kind, ...inputs, record], limitMs, what, [record], {signal});
    return JSON.parse(fs.readFileSync(record, 'utf8'));
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}
// behaviourSnapshot of every specification world, assistSnapshot of every assist case and lineSnapshot of every line of
// the worlds, each in its own child.
export const boundedSnapshot = (html, limitMs, signal) => boundedRecord('--run', 'the specification worlds', html, null, limitMs, signal);
export const boundedAssist = (html, fixture, limitMs, signal) => boundedRecord('--assist', 'the assist cases', html, fixture, limitMs, signal);
export const boundedLines = (html, limitMs, signal) => boundedRecord('--lines', 'the lines of the specification worlds', html, null, limitMs, signal);

// Cases whose record differs between two snapshots.
export function behaviourDifferences(before, after) {
  const ids = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return ids.filter(id => JSON.stringify(before[id]) !== JSON.stringify(after[id]));
}

// The record of intended changes: {schema, changes: [{case, reason}]}. Only entries this change adds count; an entry the
// base already had belongs to an earlier change. An added entry must match a difference, and every difference must have one.
export const intendedChangesFile = 'audit/manifests/intended-behaviour-changes.json';
export const intendedChangesSchema = 'akari-intended-behaviour-changes-v1';
// label names a case in a message (a line case with its text).
export function behaviourIssues(differences, baseRecord, headRecord, label = id => id) {
  const issues = [], read = record => {
    if (!record) return [];
    assert(record.schema === intendedChangesSchema && Array.isArray(record.changes), intendedChangesFile + ' has the wrong shape');
    for (const c of record.changes) assert(typeof c?.case === 'string' && typeof c.reason === 'string' && c.reason.trim().length >= 10, intendedChangesFile + ': each change names a case and a reason');
    return record.changes;
  };
  const before = new Set(read(baseRecord).map(c => c.case + '\u0000' + c.reason)), added = read(headRecord).filter(c => !before.has(c.case + '\u0000' + c.reason));
  const recorded = new Set(added.map(c => c.case));
  for (const id of differences) if (!recorded.has(id)) issues.push('the behaviour of ' + label(id) + ' changed, and ' + intendedChangesFile + ' does not record it');
  for (const c of added) if (!differences.includes(c.case)) issues.push(intendedChangesFile + ' records a change of ' + label(c.case) + ', but its behaviour did not change');
  return {issues, intended: added};
}
function assert(ok, message) { if (!ok) throw new Error(message); }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [kind, page, ...rest] = process.argv.slice(2), record = rest.at(-1), html = () => fs.readFileSync(page, 'utf8');
  if (kind === '--run') fs.writeFileSync(record, JSON.stringify(behaviourSnapshot(html(), snapshotCases())));
  if (kind === '--assist') fs.writeFileSync(record, JSON.stringify(assistSnapshot(html(), JSON.parse(fs.readFileSync(rest[0], 'utf8')))));
  if (kind === '--lines') fs.writeFileSync(record, JSON.stringify(lineSnapshot(html(), worldLines(snapshotCases()))));
}
