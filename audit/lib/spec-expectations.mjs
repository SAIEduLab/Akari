import {currentLanguageFile,resolveSpecificationFile} from './product-path.cjs';
import fs from 'node:fs';
import path from 'node:path';

// Static contract of the expectation data (audit/fixtures/spec-expectations/SCHEMA.md).
// The data is written from LANGUAGE.md alone; this module never imports a parser, a renderer or a runtime.
export const expectationsRoot = path.resolve(import.meta.dirname, '../fixtures/spec-expectations');
export const areas = Object.freeze(['common', 'meijin']);
const idPatterns = { common: { item: /^CI-\d{3}$/, case: /^CC-\d{3}$/ }, meijin: { item: /^MI-\d{3}$/, case: /^MC-\d{3}$/ } };
export const caseKinds = Object.freeze(['format', 'check', 'run', 'file', 'rename', 'ui']);
const coverages = ['cases', 'ui-only', 'unexpressible', 'document-only'];
const polarities = ['positive', 'negative', 'both'];
const inputKeys = ['key', 'click', 'answer', 'signal'];
const bareSpace = text => text.replace(/\s+/g, '');

export function readExpectationFiles(root = expectationsRoot) {
  const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
  return Object.fromEntries(areas.map(area => [area, { items: read(area + '/items.json'), cases: read(area + '/cases.json') }]));
}

// The headings of a specification document, as "parent > child" paths of its ## and ### lines.
export function specHeadings(text) {
  const out = new Set();
  let parent = null;
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const h2 = /^## (.+?)\s*$/.exec(line), h3 = /^### (.+?)\s*$/.exec(line);
    if (h2) { parent = h2[1]; out.add(parent); } else if (h3 && parent) { out.add(h3[1]); out.add(parent + ' > ' + h3[1]); }
  }
  return out;
}

export function verifyExpectations(files, { root = path.resolve(expectationsRoot, '../../..'), only = areas } = {}) {
  const problems = [];
  const fail = (where, message) => problems.push(where + ': ' + message);
  const docs = {};
  const doc = file => (docs[file] ??= bareSpace(fs.readFileSync(path.join(root, resolveSpecificationFile(file)), 'utf8')));
  const headings = specHeadings(fs.readFileSync(path.join(root, currentLanguageFile()), 'utf8'));
  const allCaseIds = new Set();
  const summary = {};
  for (const area of only) {
    const { items, cases } = files[area], patterns = idPatterns[area];
    if (items.schema !== 'akari-spec-items-v1' || items.area !== area) fail(area + '/items.json', 'schema or area');
    if (cases.schema !== 'akari-spec-expectations-v1' || cases.area !== area) fail(area + '/cases.json', 'schema or area');
    const itemById = new Map();
    for (const item of items.items ?? []) {
      const where = area + ' item ' + item.id;
      if (!patterns.item.test(item.id ?? '')) fail(where, 'id pattern');
      if (itemById.has(item.id)) fail(where, 'duplicate id');
      itemById.set(item.id, item);
      if (!headings.has(item.section)) fail(where, 'section is not a LANGUAGE.md heading: ' + item.section);
      if (typeof item.summary !== 'string' || !item.summary.trim()) fail(where, 'summary');
      if (!polarities.includes(item.polarity)) fail(where, 'polarity');
      if (!coverages.includes(item.coverage)) fail(where, 'coverage');
      if (item.coverage !== 'cases' && !(typeof item.reason === 'string' && item.reason.trim())) fail(where, 'reason is required unless coverage is cases');
      if (item.coverage === 'cases' && !(item.cases?.length)) fail(where, 'coverage cases needs cases');
      if (item.coverage === 'ui-only' && !(item.cases?.length)) fail(where, 'ui-only needs ui cases');
    }
    const caseById = new Map();
    for (const c of cases.cases ?? []) {
      const where = area + ' case ' + c.id;
      if (!patterns.case.test(c.id ?? '')) fail(where, 'id pattern');
      if (allCaseIds.has(c.id)) fail(where, 'duplicate id');
      allCaseIds.add(c.id); caseById.set(c.id, c);
      const item = itemById.get(c.item);
      if (!item) fail(where, 'unknown item ' + c.item); else if (!(item.cases ?? []).includes(c.id)) fail(where, 'item ' + c.item + ' does not list this case');
      if (!caseKinds.includes(c.kind)) fail(where, 'kind');
      if (!['positive', 'negative'].includes(c.polarity)) fail(where, 'polarity');
      if (typeof c.title !== 'string' || !c.title.trim()) fail(where, 'title');
      if (!c.basis?.length) fail(where, 'basis is required');
      for (const b of c.basis ?? []) {
        if (!['LANGUAGE.md', 'EXTENSIONS.md'].includes(b.file)) { fail(where, 'basis file ' + b.file); continue; }
        if (typeof b.quote !== 'string' || bareSpace(b.quote).length < 6) fail(where, 'basis quote is too short');
        else if (!doc(b.file).includes(bareSpace(b.quote))) fail(where, 'basis quote is not in ' + b.file + ': ' + b.quote.slice(0, 40));
      }
      verifyCaseShape(c, area, where, fail);
    }
    for (const item of itemById.values()) {
      for (const id of item.cases ?? []) if (!caseById.has(id)) fail(area + ' item ' + item.id, 'lists unknown case ' + id);
      if (item.coverage === 'cases' && item.polarity === 'both') {
        const kinds = new Set((item.cases ?? []).map(id => caseById.get(id)?.polarity));
        if (!kinds.has('positive') || !kinds.has('negative')) fail(area + ' item ' + item.id, 'polarity both needs a positive and a negative case');
      }
    }
    for (const gap of items.specGaps ?? []) {
      if (!(typeof gap.where === 'string' && gap.where.trim() && typeof gap.question === 'string' && gap.question.trim())) fail(area + ' specGaps', 'where and question');
      for (const id of gap.items ?? []) if (!itemById.has(id)) fail(area + ' specGaps', 'unknown item ' + id);
    }
    summary[area] = {
      items: itemById.size, cases: caseById.size,
      byKind: Object.fromEntries(caseKinds.map(kind => [kind, [...caseById.values()].filter(c => c.kind === kind).length])),
      positive: [...caseById.values()].filter(c => c.polarity === 'positive').length,
      negative: [...caseById.values()].filter(c => c.polarity === 'negative').length,
      uncovered: [...itemById.values()].filter(i => i.coverage !== 'cases').length,
      specGaps: (items.specGaps ?? []).length,
    };
  }
  return { problems, summary };
}

function verifyWorld(world, area, where, fail) {
  if (!world || typeof world !== 'object') { fail(where, 'world'); return; }
  const names = new Set();
  for (const part of world.parts ?? []) {
    if (typeof part.name !== 'string' || !part.name) fail(where, 'part name');
    else if (names.has(part.name)) fail(where, 'duplicate part ' + part.name);
    names.add(part.name);
  }
  if (!world.scripts?.length) fail(where, 'world.scripts');
  for (const kind of ['actions', 'functions']) for (const x of world[kind] ?? []) if (!(typeof x.name === 'string' && x.name && typeof x.source === 'string' && (x.args === undefined || Array.isArray(x.args)))) fail(where, 'world.' + kind + ' needs name, source and an args array');
  for (const script of world.scripts ?? []) {
    if (typeof script.source !== 'string') fail(where, 'script source');
    if (script.owner === 'meijin') { if (area !== 'meijin') fail(where, 'owner meijin outside the meijin area'); }
    else if (script.owner !== 'stage' && !names.has(script.owner)) fail(where, 'script owner is not a part: ' + script.owner);
  }
}

function verifyCaseShape(c, area, where, fail) {
  if (c.kind === 'format') {
    if (area === 'meijin') fail(where, 'meijin text is never formatted');
    for (const key of ['owner', 'source', 'formatted']) if (typeof c[key] !== 'string') fail(where, 'format.' + key);
  } else if (c.kind === 'check') {
    verifyWorld(c.world, area, where, fail);
    if (typeof c.expect?.stops !== 'boolean') fail(where, 'check.expect.stops');
    if (c.polarity === 'negative' && c.expect?.stops !== true && !(c.expect?.notices?.length)) fail(where, 'a negative check must stop or give a notice');
    for (const n of c.expect?.notices ?? []) if (typeof n.contains !== 'string' || !n.contains) fail(where, 'notice contains');
    if (c.expect?.errorCode !== undefined && (!c.expect.stops || !/^[PSRFXE]\d{3}$/.test(c.expect.errorCode))) fail(where, 'check.expect.errorCode requires a stopping diagnostic code');
    const word = w => (typeof w === 'string' && w) || (Array.isArray(w) && w.length && w.every(x => typeof x === 'string' && x));
    for (const key of ['guidanceContains', 'guidanceAbsent', 'fixContains']) for (const w of c.expect?.[key] ?? []) if (!word(w)) fail(where, key + ' entries are words or lists of spellings');
  } else if (c.kind === 'run') {
    verifyWorld(c.world, area, where, fail);
    const until = c.run?.untilMs;
    if (!(Number.isFinite(until) && until >= 0)) fail(where, 'run.untilMs');
    const e = c.expect ?? {};
    if (!(e.speech || e.speechContains || e.speechCount !== undefined || e.at?.length || e.final)) fail(where, 'run needs an expectation');
    if (e.speechCount !== undefined && !Number.isInteger(e.speechCount)) fail(where, 'speechCount');
    if (e.speechEachPartIn !== undefined && !(Array.isArray(e.speechEachPartIn) && e.speechEachPartIn.length)) fail(where, 'speechEachPartIn');
    for (const s of [...(e.speech ?? []), ...(e.speechContains ?? [])]) {
      if (typeof s.part !== 'string' || typeof s.text !== 'string' || !Number.isFinite(s.atMs)) fail(where, 'speech entry');
      else if (s.atMs > until) fail(where, 'speech after untilMs');
    }
    for (const a of e.at ?? []) if (!(Number.isFinite(a.atMs) && a.atMs <= until)) fail(where, 'at.atMs');
    for (const i of c.inputs ?? []) {
      if (!(Number.isFinite(i.atMs) && i.atMs <= until)) fail(where, 'input.atMs');
      if (inputKeys.filter(key => i[key] !== undefined).length !== 1) fail(where, 'input needs exactly one of ' + inputKeys.join('/'));
    }
    for (const edit of c.edits ?? []) if (!(Number.isFinite(edit.atMs) && edit.atMs <= until && typeof edit.part === 'string' && edit.set)) fail(where, 'edit');
  } else if (c.kind === 'file') {
    if (c.action === 'save-reopen') { verifyWorld(c.world, area, where, fail); if (!c.expect?.scripts?.length) fail(where, 'file.expect.scripts'); }
    else if (c.action === 'open-declared') { if (!c.declare || typeof c.expect?.refused !== 'boolean') fail(where, 'open-declared needs declare and expect.refused'); }
    else fail(where, 'file.action');
  } else if (c.kind === 'rename') {
    verifyWorld(c.world, area, where, fail);
    if (!['part', 'variable', 'list', 'procedure'].includes(c.rename?.what) || !c.rename?.from || !c.rename?.to) fail(where, 'rename');
    if (!(c.expect?.sourceContains?.length || c.expect?.sourceAbsent?.length || (c.expect?.refused === true && c.expect?.refusalContains?.length))) fail(where, 'rename.expect');
  } else if (c.kind === 'ui') {
    if (!c.steps?.length || !c.expect?.length) fail(where, 'ui.steps and ui.expect');
  }
}

// Mutations that each validator rule must reject; the static audit runs them on a copy of the data.
export function expectationNegatives(files) {
  const common = area => files[area].cases.cases, items = area => files[area].items.items;
  const firstOf = (area, test) => common(area).find(test);
  const bothItem = items('common').find(item => item.polarity === 'both' && item.coverage === 'cases');
  return [
    ['quote-not-in-specification', f => { f.common.cases.cases[0].basis[0].quote = 'この引用は仕様のどこにもありません'; }],
    ['unknown-item', f => { f.common.cases.cases[0].item = 'CI-999'; }],
    ['duplicate-case-id', f => { f.common.cases.cases[1].id = f.common.cases.cases[0].id; }],
    ['item-without-cases', f => { const i = f.common.items.items.find(item => item.coverage === 'cases'); i.cases = []; }],
    ['item-does-not-list-case', f => { const i = f.common.items.items.find(item => item.cases?.length); i.cases = i.cases.slice(1); }],
    ['both-polarity-without-negative', f => { const item = f.common.items.items.find(x => x.id === bothItem.id); for (const id of item.cases) f.common.cases.cases.find(c => c.id === id).polarity = 'positive'; }],
    ['section-is-not-a-heading', f => { f.common.items.items[0].section = '仕様にない見出し'; }],
    ['run-without-expectation', f => { const c = f.common.cases.cases.find(x => x.kind === 'run'); c.expect = {}; }],
    ['meijin-case-is-formatted', f => { f.meijin.cases.cases.find(x => x.kind === 'check').kind = 'format'; }],
    ['meijin-owner-in-common', f => { const c = f.common.cases.cases.find(x => x.kind === 'check'); c.world.scripts[0].owner = 'meijin'; }],
    ['invalid-check-error-code', f => { f.common.cases.cases.find(c => c.kind === 'check').expect.errorCode='bad'; }],
    ['basis-is-missing', f => { f.meijin.cases.cases[0].basis = []; }],
  ].map(([id, mutate]) => ({ id, mutate }));
}

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function verifyExpectationsStaticReport(report, inputs) {
  const files = readExpectationFiles(), { problems, summary } = verifyExpectations(files);
  if (problems.length) throw Error('expectation data: ' + problems[0]);
  if (report.schema !== 'akari-spec-expectations-static-v1' || report.status !== 'PASS') throw Error('static report status');
  if (!sameJson(report.snapshot, inputs)) throw Error('static report snapshot');
  if (!sameJson(report.summary, summary)) throw Error('static report summary differs from the data');
  const ids = expectationNegatives(files).map(n => n.id);
  if (!sameJson(report.negatives.map(n => n.id), ids) || report.negatives.some(n => n.rejected !== true)) throw Error('static report negatives');
  return { status: 'PASS', cases: Object.values(summary).reduce((n, a) => n + a.cases, 0) };
}

// The run covers every case of the data. Only screen-operation cases (kind ui) are not executed here; all others must pass.
export function verifyExpectationsRunReport(report, inputs, { sha }) {
  const files = readExpectationFiles(), { problems } = verifyExpectations(files);
  if (problems.length) throw Error('expectation data: ' + problems[0]);
  if (report.schema !== 'akari-spec-expectations-run-v1' || report.status !== 'PASS') throw Error('run report status');
  if (!sameJson(report.snapshot, inputs)) throw Error('run report snapshot');
  const hashes = Object.fromEntries(areas.flatMap(area => ['items', 'cases'].map(kind =>
    [`${area}/${kind}.json`, sha(fs.readFileSync(path.join(expectationsRoot, area, kind + '.json')))])));
  if (!sameJson(report.inputs, hashes)) throw Error('run report ran other expectation data');
  const want = areas.flatMap(area => files[area].cases.cases.map(c => [c.id, c.kind]));
  if (!sameJson(report.results.map(r => [r.id, r.kind]), want)) throw Error('run report does not cover the cases in order');
  for (const r of report.results) {
    const ok = r.kind === 'ui' ? r.status === 'NOT_RUN' : r.status === 'PASS';
    if (!ok) throw Error('run report case ' + r.id + ' is ' + r.status);
  }
  return { status: 'PASS', cases: want.length, notRun: report.results.filter(r => r.status === 'NOT_RUN').length };
}

// The screen-operation cases (kind ui) are done in a real browser by audit/tests/spec-expectations-ui.mjs; all must pass.
export function verifyExpectationsUiReport(report, inputs, { sha }) {
  const files = readExpectationFiles();
  if (report.schema !== 'akari-spec-expectations-ui-v1' || report.status !== 'PASS') throw Error('ui report status');
  if (!sameJson(report.snapshot, inputs)) throw Error('ui report snapshot');
  const hashes = Object.fromEntries(areas.map(area => [area + '/cases.json', sha(fs.readFileSync(path.join(expectationsRoot, area, 'cases.json')))]));
  if (!sameJson(report.inputs, hashes)) throw Error('ui report ran other expectation data');
  const want = areas.flatMap(area => files[area].cases.cases.filter(c => c.kind === 'ui').map(c => c.id));
  if (!sameJson(report.results.map(r => r.id), want)) throw Error('ui report does not cover the screen-operation cases in order');
  for (const r of report.results) if (r.status !== 'PASS' || Object.values(r.expect || {}).some(v => v !== true)) throw Error('ui case ' + r.id + ' is ' + r.status);
  if (report.pageErrors.length || report.network.length) throw Error('ui report has page errors or network requests');
  return { status: 'PASS', cases: want.length };
}
