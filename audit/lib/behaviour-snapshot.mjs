// The product's behaviour over fixed works (AUDIT.md「前の版との振る舞いの差分」). Every specification world
// (audit/fixtures/spec-expectations) is built as a work, written back as code and through blocks, checked, and run on a
// fake clock with a fixed random seed; what the work says, where its parts are, its values and its runtime errors are
// recorded. The same product gives the same record, so two products that differ in the record behave differently.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import cp from 'node:child_process';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildProject} from './spec-expectations-host.mjs';
import {areas, expectationsRoot} from './spec-expectations.mjs';

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

// The product's API in a fresh context, as the node suites load it.
export function productApi(html) {
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  const context = {console, TextEncoder, TextDecoder, Uint8Array, Uint32Array, ArrayBuffer, Blob, URL, structuredClone, crypto: crypto.webcrypto, setTimeout, clearTimeout};
  vm.runInNewContext(script, context, {timeout: 30000});
  return context.Akari;
}

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

export function behaviourSnapshot(html, cases) {
  // A page with no Akari API (a synthetic test product) runs nothing: that is its behaviour in every world.
  let api;
  try { api = productApi(html); } catch (error) { api = null; }
  if (!api?.makeEmptyProject) return Object.fromEntries(cases.map(c => [c.id, {unavailable: 'the page has no Akari API'}]));
  return Object.fromEntries(cases.map(c => [c.id, caseBehaviour(api, c)]));
}

// behaviourSnapshot of every specification world in a child process (node audit/lib/behaviour-snapshot.mjs --run <page>
// <record>), stopped after limitMs.
export function boundedSnapshot(html, limitMs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akari-snapshot-'));
  try {
    const page = path.join(dir, 'page.html'), record = path.join(dir, 'record.json');
    fs.writeFileSync(page, html);
    runLimited([fileURLToPath(import.meta.url), '--run', page, record], limitMs, 'the specification worlds', [record]);
    return JSON.parse(fs.readFileSync(record, 'utf8'));
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === '--run')
  fs.writeFileSync(process.argv[4], JSON.stringify(behaviourSnapshot(fs.readFileSync(process.argv[3], 'utf8'), snapshotCases())));

// Cases whose record differs between two snapshots.
export function behaviourDifferences(before, after) {
  const ids = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return ids.filter(id => JSON.stringify(before[id]) !== JSON.stringify(after[id]));
}

// The record of intended changes: {schema, changes: [{case, reason}]}. Only entries this change adds count; an entry the
// base already had belongs to an earlier change. An added entry must match a difference, and every difference must have one.
export const intendedChangesFile = 'audit/manifests/intended-behaviour-changes.json';
export const intendedChangesSchema = 'akari-intended-behaviour-changes-v1';
export function behaviourIssues(differences, baseRecord, headRecord) {
  const issues = [], read = record => {
    if (!record) return [];
    assert(record.schema === intendedChangesSchema && Array.isArray(record.changes), intendedChangesFile + ' has the wrong shape');
    for (const c of record.changes) assert(typeof c?.case === 'string' && typeof c.reason === 'string' && c.reason.trim().length >= 10, intendedChangesFile + ': each change names a case and a reason');
    return record.changes;
  };
  const before = new Set(read(baseRecord).map(c => c.case + '\u0000' + c.reason)), added = read(headRecord).filter(c => !before.has(c.case + '\u0000' + c.reason));
  const recorded = new Set(added.map(c => c.case));
  for (const id of differences) if (!recorded.has(id)) issues.push('the behaviour of ' + id + ' changed, and ' + intendedChangesFile + ' does not record it');
  for (const c of added) if (!differences.includes(c.case)) issues.push(intendedChangesFile + ' records a change of ' + c.case + ', but its behaviour did not change');
  return {issues, intended: added};
}
function assert(ok, message) { if (!ok) throw new Error(message); }
