// Runs the expectation cases (audit/fixtures/spec-expectations/SCHEMA.md) against the product API.
// The host only builds worlds, drives the real scheduler on a fake clock and reads observations back.
// It holds no expectation of its own: every expected value comes from the case data.
const FACE = { name: '顔', kind: 'text', value: '●' }, SMILE = { name: 'えがお', kind: 'text', value: '☺' };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const plain = value => {
  if (value && typeof value === 'object' && 'magnitude' in value) return value.magnitude;
  if (value && typeof value === 'object' && 'part' in value && 'name' in value) return value.name;
  return value;
};

export function buildProject(api, world, { saved = false } = {}) {
  const p = api.makeEmptyProject(), base = p.components.find(c => c.type === 'sprite');
  // world.stage sets the work screen's size; a part without x/y is at the screen's centre (SCHEMA.md world).
  if (world.stage) Object.assign(p.stage, { width: world.stage.width ?? p.stage.width, height: world.stage.height ?? p.stage.height });
  const ids = new Map();
  p.components = (world.parts ?? []).map((part, i) => {
    const id = 'w-part-' + i;
    ids.set(part.name, id);
    return {
      ...structuredClone(base), id, name: part.name, x: part.x ?? p.stage.width / 2, y: part.y ?? p.stage.height / 2, w: part.w ?? 40, h: part.h ?? 40,
      direction: part.direction ?? 0, scalePercent: part.size ?? 100, visible: part.visible ?? true,
      costumes: [{ id: id + '-face', ...FACE }, { id: id + '-smile', ...SMILE }], costumeId: id + '-face',
      localData: { variables: Object.entries(part.vars ?? {}).map(([name, initialValue], j) => ({ id: id + '-v' + j, name, initialValue })), lists: [] },
    };
  });
  p.projectData.variables = Object.entries(world.variables ?? {}).map(([name, initialValue], i) => ({ id: 'w-var-' + i, name, initialValue }));
  p.projectData.lists = Object.entries(world.lists ?? {}).map(([name, initialValue], i) => ({ id: 'w-list-' + i, name, initialValue: [...initialValue] }));
  p.sounds = saved ? [] : [{ id: 'w-sound-bell', name: 'ベル', assetId: 'w-asset-bell' }];
  // Named things the sentences refer to: backdrops, sounds and costumes (text stand-ins; they are never saved).
  for (const name of world.assets?.backdrops ?? []) if (!p.stage.backdrops.some(b => b.name === name)) p.stage.backdrops.push({ id: 'w-backdrop-' + p.stage.backdrops.length, name, kind: 'color', value: '#b3e5fc' });
  // A sound is a name (one second long) or { name, seconds }.
  const soundSeconds = new Map(p.sounds.map(s => [s.assetId, 1]));
  for (const sound of world.assets?.sounds ?? []) {
    const name = typeof sound === 'string' ? sound : sound.name;
    if (p.sounds.some(s => s.name === name)) continue;
    const assetId = 'w-asset-' + p.sounds.length;
    p.sounds.push({ id: 'w-sound-' + p.sounds.length, name, assetId });
    soundSeconds.set(assetId, typeof sound === 'string' ? 1 : sound.seconds ?? 1);
  }
  for (const [part, names] of Object.entries(world.assets?.costumes ?? {})) {
    const component = p.components.find(x => x.name === part);
    for (const name of names) if (!component.costumes.some(x => x.name === name)) component.costumes.push({ id: component.id + '-c' + component.costumes.length, name, kind: 'text', value: '☺' });
  }
  p.actions = (world.actions ?? []).map((x, i) => ({ id: 'w-action-' + i, ownerId: 'stage', name: x.name, args: x.args ?? [], source: x.source }));
  p.functions = (world.functions ?? []).map((x, i) => ({ id: 'w-function-' + i, ownerId: 'stage', name: x.name, args: x.args ?? [], source: x.source }));
  p.scripts = (world.scripts ?? []).map((script, i) => ({
    id: 'w-script-' + i, event: 'start', source: '',
    ...(script.owner === 'meijin' ? { mode: 'meijin', targetId: 'meijin' } : { targetId: script.owner === 'stage' ? 'stage' : ids.get(script.owner) }),
  }));
  // A text the editor refuses to take (updateScriptSource throws, for example a touch heading in the stage's body)
  // stays uncommitted there, and 作品チェック shows the reason under it: the check sees a stopping error at its line 1.
  const refusals = [];
  p.scripts.forEach((script, i) => {
    try { api.updateScriptSource(script, world.scripts[i].source, p); }
    catch (error) { if (!error?.code) throw error; refusals.push({ code: error.code, line: error.line ?? 1, message: String(error.message), script: i }); }
  });
  return { project: p, ids, soundSeconds, refusals };
}
const refusalText = x => x.code + '@' + x.line + ' ' + x.message;

export function checkResult(api, c) {
  const { project, refusals } = buildProject(api, c.world), compiled = api.compileProject(project);
  const errors = [...refusals, ...(compiled.errors ?? [])], notes = compiled.notes ?? [], e = c.expect;
  const problems = [];
  if ((errors.length > 0) !== e.stops) problems.push('stops: expected ' + e.stops + ', got ' + JSON.stringify(errors.slice(0, 2).map(x => x.code + '@' + x.line + ' ' + x.message)));
  if (e.stops && e.line !== undefined && errors[0] && errors[0].line !== e.line) problems.push('line: expected ' + e.line + ', got ' + errors[0].line);
  // A word may be given with its spellings (['順', 'じゅん']); spaces between words (分かち書き) are not compared.
  const bare = text => String(text).replace(/\s+/g, ''), guidance = bare(errors.map(x => x.message).join(''));
  const has = (text, word) => [].concat(word).some(w => bare(text).includes(bare(w))), words = word => [].concat(word).join('/');
  for (const word of e.guidanceContains ?? []) if (!has(guidance, word)) problems.push('guidance lacks ' + words(word));
  for (const word of e.guidanceAbsent ?? []) if (has(guidance, word)) problems.push('guidance has ' + words(word));
  // A 直し方 (the one-click fix) is the text a proposal writes in place of the child's sentence, from an error or a notice.
  const fixes = [...errors, ...notes].flatMap(x => (x.proposals ?? []).map(p => String(p.source ?? '')));
  for (const word of e.fixContains ?? []) if (!fixes.some(text => has(text, word))) problems.push('no fix writes ' + words(word) + '; fixes: ' + JSON.stringify(fixes));
  for (const n of e.notices ?? []) {
    if (!notes.some(x => has(x.message, n.contains) && (n.line === undefined || x.line === n.line))) problems.push('notice missing: ' + n.contains + (n.line === undefined ? '' : '@' + n.line));
  }
  if (e.noNotices && notes.length) problems.push('unexpected notices: ' + notes.map(x => x.message).join(' / '));
  return problems;
}

// The parts and data the format cases name. A case may carry its own world instead.
const FORMAT_WORLD = {
  parts: ['たくどん', 'ねこ', 'だんご', 'いぬ', '犬', '星', '鳥', 'ロケット'].map(name => ({ name, vars: { 体力: 10 } })),
  variables: { 点数: 0, 名前: '', 合計: 0 },
  lists: { 名前一覧: [], 持ち物: [] },
  scripts: [],
};
export function formatResult(api, c) {
  const world = c.world ? { ...c.world, scripts: c.world.scripts ?? [] } : FORMAT_WORLD;
  const { project, ids } = buildProject(api, world);
  const context = { symbols: api.buildSymbols(project), targetId: ids.get(c.owner) ?? 'stage', event: 'start' };
  const problems = [], parsed = api.parseSyntax(c.source, context);
  if (!parsed.ast) return ['source is not read: ' + JSON.stringify(parsed.syntaxDiagnostics?.[0]?.code)];
  const formatted = api.formatScript(parsed.ast);
  if (formatted !== c.formatted) problems.push('formatted: expected ' + JSON.stringify(c.formatted) + ', got ' + JSON.stringify(formatted));
  const again = api.parseSyntax(formatted, context);
  if (!again.ast) problems.push('formatted text is not read again');
  else if (api.formatScript(again.ast) !== formatted) problems.push('formatting is not stable');
  if (c.blockRoundTrip) {
    try {
      const back = api.blockDecode(api.blockEncode(parsed.ast).tree);
      if (api.formatScript(back) !== c.formatted) problems.push('block round trip: ' + JSON.stringify(api.formatScript(back)));
    } catch (error) { problems.push('block round trip failed: ' + (error.code || error.message)); }
  }
  return problems;
}

// A sound device on the logical clock: a sound ends when its length has passed, or when the runtime stops it.
function fakeAudio(now, soundSeconds) {
  let serial = 0;
  const active = new Map();
  const begin = (seconds, onEnded) => { const id = 'w-audio-' + ++serial; active.set(id, { id, endAt: now() + seconds * 1000, onEnded }); return id; };
  return {
    activeAudioHandles: active,
    startTone: (_frequency, seconds, _volume, _pitch, onEnded = null) => begin(seconds, onEnded),
    startSample: (buffer, _volume, pitch, onEnded = null) => begin(buffer.duration / Math.pow(2, pitch / 12), onEnded),
    getAudioBuffer: assetId => soundSeconds.has(assetId) ? { duration: soundSeconds.get(assetId) } : null,
    getImage: () => null,
    setPaused() {},
    stopHandle(id, { notify = true } = {}) { const h = active.get(id); if (!h) return; active.delete(id); if (notify) h.onEnded?.(id); },
    stopAllHandles({ notify = true } = {}) { for (const id of [...active.keys()]) this.stopHandle(id, { notify }); },
    advance(time) { for (const h of [...active.values()]) if (h.endAt <= time) { active.delete(h.id); h.onEnded?.(h.id); } },
  };
}

export function runResult(api, c) {
  const { project, ids, soundSeconds, refusals } = buildProject(api, c.world);
  if (refusals.length) return ['work check stops: ' + refusalText(refusals[0])];
  const compiled = api.compileProject(project);
  if (compiled.errors.length) return ['work check stops: ' + refusalText(compiled.errors[0])];
  const nameOf = id => project.components.find(x => x.id === r.actor(id)?.baseId)?.name ?? id;
  let now = 0, answer = null;
  const speech = [];
  const audio = fakeAudio(() => now, soundSeconds);
  const r = new api.RuntimeModel(project, {}, audio);
  const q = new api.EventScheduler(project, compiled, r, { say: (id, text) => speech.push({ part: nameOf(id), text: String(text), atMs: now }), ask: (_question, callback) => { answer = callback; } });
  r.now = () => now; q.schedule = () => {};
  const read = {
    parts: () => Object.fromEntries(project.components.map(x => {
      const a = r.actor(x.id);
      return [x.name, { x: a.x, y: a.y, direction: a.direction, size: a.scalePercent, visible: a.visible, vars: Object.fromEntries([...a.vars].map(([k, v]) => [k, plain(v)])) }];
    })),
    variables: () => Object.fromEntries([...r.projectVars].map(([k, v]) => [k, plain(v)])),
    lists: () => Object.fromEntries([...r.projectLists].map(([k, v]) => [k, v.map(plain)])),
  };
  const samples = [], pendingAt = [...(c.expect.at ?? [])].sort((a, b) => a.atMs - b.atMs);
  const inputs = [...(c.inputs ?? [])].sort((a, b) => a.atMs - b.atMs), edits = [...(c.edits ?? [])].sort((a, b) => a.atMs - b.atMs);
  const step = c.run.stepMs ?? 1, problems = [];
  const apply = {
    key: (i) => { q.setKeyState(i.key, true); q.spawnDistributed('keyDown', { key: i.key }); if (i.releaseAtMs !== undefined) releases.push({ atMs: i.releaseAtMs, key: i.key }); },
    click: (i) => q.spawnForRuntime(ids.get(i.click), 'click', {}),
    answer: (i) => { if (answer) { const done = answer; answer = null; done(i.answer); } else problems.push('answer given with no question at ' + i.atMs); },
    signal: (i) => q.spawnDistributed('message', { message: i.signal }),
  };
  const releases = [];
  try {
    q.start();
    for (now = 0; now <= c.run.untilMs; now += step) {
      while (edits.length && edits[0].atMs <= now) {
        const edit = edits.shift(), a = r.actor(ids.get(edit.part));
        for (const [key, value] of Object.entries(edit.set)) {
          if (key === 'size') a.scalePercent = value; else if (key === 'vars') { for (const [name, v] of Object.entries(value)) a.vars.set(name, v); } else a[key] = value;
        }
      }
      audio.advance(now);
      while (releases.length && releases[0].atMs <= now) q.setKeyState(releases.shift().key, false);
      // The stage takes a key, a click or a signal only while the work runs and is not paused (08 allowed());
      // after 作品を全部止める such an input is dropped, as on the screen.
      while (inputs.length && inputs[0].atMs <= now) {
        const i = inputs.shift(), kind = ['key', 'click', 'answer', 'signal'].find(k => i[k] !== undefined);
        if (kind === 'answer' || (q.running && !q.paused)) apply[kind](i);
      }
      // A wait that ends at this time makes its task ready now, so it takes its turn at this time, as the product's loop
      // does (it re-checks the waits and runs again at once), not one step later.
      q.recheckBlocked();
      for (let n = 0; n < 500 && q.ready.length; n++) q.runTurn();
      q.recheckBlocked();
      while (pendingAt.length && pendingAt[0].atMs <= now) samples.push({ want: pendingAt.shift(), parts: read.parts(), variables: read.variables(), lists: read.lists() });
    }
    const tolMs = c.expect.tolerance?.ms ?? 20, tolPx = c.expect.tolerance?.px ?? 1, e = c.expect;
    const num = (want, got) => typeof want === 'number' && typeof got === 'number' ? Math.abs(want - got) <= tolPx : same(want, got);
    const fmt = s => s.map(x => `${x.atMs}:${x.part}:${x.text}`).join(' | ');
    if (e.speech) {
      const okSpeech = e.speech.length === speech.length && e.speech.every((w, i) => w.part === speech[i].part && w.text === speech[i].text && Math.abs(w.atMs - speech[i].atMs) <= tolMs);
      if (!okSpeech) problems.push('speech: expected ' + fmt(e.speech) + '; got ' + fmt(speech));
    }
    if (e.speechContains) {
      let from = 0;
      for (const w of e.speechContains) {
        const at = speech.findIndex((s, i) => i >= from && s.part === w.part && s.text === w.text && Math.abs(s.atMs - w.atMs) <= tolMs);
        if (at < 0) problems.push('speech lacks ' + fmt([w]) + '; got ' + fmt(speech)); else from = at + 1;
      }
    }
    if (e.speechCount !== undefined && speech.length !== e.speechCount) problems.push('speechCount: expected ' + e.speechCount + ', got ' + speech.length);
    if (e.speechEachPartIn) for (const s of speech) if (!e.speechEachPartIn.includes(s.part)) problems.push('speaker ' + s.part + ' is not one of ' + e.speechEachPartIn.join(','));
    if (samples.length !== (e.at ?? []).length) problems.push('at: ' + ((e.at ?? []).length - samples.length) + ' samples after untilMs');
    for (const s of samples) {
      for (const [name, fields] of Object.entries(s.want.parts ?? {})) for (const [field, want] of Object.entries(fields)) {
        // vars is an object of the part's own variables; compare each named value.
        if (field === 'vars') { for (const [vn, vw] of Object.entries(want)) if (!num(vw, s.parts[name]?.vars?.[vn])) problems.push(`@${s.want.atMs} ${name}.${vn}: expected ${JSON.stringify(vw)}, got ${JSON.stringify(s.parts[name]?.vars?.[vn])}`); continue; }
        if (!num(want, s.parts[name]?.[field])) problems.push(`@${s.want.atMs} ${name}.${field}: expected ${JSON.stringify(want)}, got ${JSON.stringify(s.parts[name]?.[field])}`);
      }
      for (const [name, want] of Object.entries(s.want.variables ?? {})) if (!num(want, s.variables[name])) problems.push(`@${s.want.atMs} ${name}: expected ${JSON.stringify(want)}, got ${JSON.stringify(s.variables[name])}`);
      for (const [name, want] of Object.entries(s.want.lists ?? {})) if (!same(want, s.lists[name])) problems.push(`@${s.want.atMs} list ${name}: expected ${JSON.stringify(want)}, got ${JSON.stringify(s.lists[name])}`);
    }
    const f = e.final;
    if (f) {
      for (const [name, want] of Object.entries(f.variables ?? {})) if (!num(want, read.variables()[name])) problems.push(`final ${name}: expected ${JSON.stringify(want)}, got ${JSON.stringify(read.variables()[name])}`);
      for (const [name, want] of Object.entries(f.lists ?? {})) if (!same(want, read.lists()[name])) problems.push(`final list ${name}: expected ${JSON.stringify(want)}, got ${JSON.stringify(read.lists()[name])}`);
      if (f.copies !== undefined) {
        const clones = [...r.actors.values()].filter(a => a.isClone), byName = {};
        for (const a of clones) { const n = project.components.find(x => x.id === a.baseId)?.name; byName[n] = (byName[n] ?? 0) + 1; }
        if (typeof f.copies === 'number') { if (clones.length !== f.copies) problems.push('copies: expected ' + f.copies + ', got ' + clones.length); }
        else for (const [name, want] of Object.entries(f.copies)) if ((byName[name] ?? 0) !== want) problems.push(`copies ${name}: expected ${want}, got ${byName[name] ?? 0}`);
      }
      if (f.runtimeErrors !== undefined) {
        const codes = q.errorRecords.map(x => x.code);
        if (f.runtimeErrors === 'none') { if (codes.length) problems.push('runtime errors: ' + codes.join(',')); }
        else if (f.runtimeErrors === 'any') { if (!codes.length) problems.push('a runtime error was expected'); }
        else if (!same([...f.runtimeErrors].sort(), [...codes].sort())) problems.push('runtime errors: expected ' + f.runtimeErrors.join(',') + ', got ' + codes.join(','));
      }
      if (f.activeTasks !== undefined && q.tasks.size !== f.activeTasks) problems.push('activeTasks: expected ' + f.activeTasks + ', got ' + q.tasks.size);
    }
  } finally { q.stop(); }
  return problems;
}

export async function fileResult(api, c) {
  const problems = [];
  if (c.action === 'open-declared') {
    // A work with text costumes only: opening it needs no image decoding.
    let text = api.serializeProject(buildProject(api, { parts: [{ name: 'ねこ' }], scripts: [{ owner: 'ねこ', source: 'ねこはいまのばしょから、右へ10歩動く。' }] }, { saved: true }).project);
    // The untouched file must open, so a refusal below comes from the declared number alone.
    try { await api.parseProjectFile(text); } catch (error) { return ['the control file does not open: ' + error.code]; }
    // A declared number rewrites the data marker and the numbers the file holds; any other key cannot be declared here.
    const known = ['projectFormatVersion', 'formatVersion', 'languageContractId'];
    const unknown = Object.keys(c.declare).filter(key => !known.includes(key));
    if (unknown.length) return ['declare key cannot be applied: ' + unknown.join(',')];
    const declared = c.declare.projectFormatVersion ?? c.declare.formatVersion;
    if (declared !== undefined) text = text.split(/AKARI-PROJECT-F\d+-DATA/g).join('AKARI-PROJECT-F' + declared + '-DATA').split(/"formatVersion": \d+/).join('"formatVersion": ' + declared);
    if (c.declare.languageContractId !== undefined) text = text.split(/"languageContractId": \d+/).join('"languageContractId": ' + c.declare.languageContractId);
    let refused = false, code = null;
    try { await api.parseProjectFile(text); } catch (error) { refused = true; code = error.code; }
    if (refused !== c.expect.refused) problems.push('refused: expected ' + c.expect.refused + ', got ' + refused + (code ? ' (' + code + ')' : ''));
    return problems;
  }
  const { project, refusals } = buildProject(api, c.world, { saved: true });
  if (refusals.length) return ['the world text is refused: ' + refusalText(refusals[0])];
  // The saved text is what the file holds; the work opened again must read the same scripts back.
  const text = api.serializeProject(project), reopened = (await api.parseProjectFile(text)).project;
  const saved = JSON.parse(/<!-- AKARI-PROJECT-F\d+-DATA-BEGIN -->\n```json\n([\s\S]*)\n```\n<!-- AKARI-PROJECT-F\d+-DATA-END -->/.exec(text)[1]);
  if (reopened.scripts.length !== saved.scripts.length) problems.push('reopened work has ' + reopened.scripts.length + ' scripts; the file has ' + saved.scripts.length);
  for (const want of c.expect.scripts) {
    const got = saved.scripts[want.index];
    if (!got) { problems.push('script ' + want.index + ' is missing in the saved file'); continue; }
    if (reopened.scripts[want.index]?.source !== got.source) problems.push('script ' + want.index + ' reads back differently after reopening');
    for (const [key, value] of Object.entries(want.has ?? {})) if (!same(got[key], value)) problems.push(`script ${want.index}.${key}: expected ${JSON.stringify(value)}, got ${JSON.stringify(got[key])}`);
    for (const key of want.lacks ?? []) if (key in got) problems.push(`script ${want.index} has ${key}`);
    if (want.source !== undefined && got.source !== want.source) problems.push(`script ${want.index}.source: expected ${JSON.stringify(want.source)}, got ${JSON.stringify(got.source)}`);
  }
  return problems;
}

export function renameResult(api, c) {
  const { project, refusals } = buildProject(api, c.world), { what, from, to } = c.rename;
  if (refusals.length) return ['the world text is refused: ' + refusalText(refusals[0])];
  const textOf = scripts => scripts.map(s => s.source).join('\n');
  const sourceProblems = joined => [
    ...(c.expect.sourceContains ?? []).filter(word => !joined.includes(word)).map(word => 'renamed text lacks ' + word),
    ...(c.expect.sourceAbsent ?? []).filter(word => joined.includes(word)).map(word => 'renamed text still has ' + word),
  ];
  let next;
  try {
    const resourceOf = test => { const found = api.buildProjectReferenceGraph(project).resources.find(test); if (!found) throw Error('no ' + what + ' named ' + from); return found; };
    if (what === 'procedure') {
      const definition = api.meijinProjectDefinitions(project).find(d => d.name === from);
      next = definition ? api.prepareMeijinProcedureRename(project, definition.id, to)
        : api.prepareResourceRename(project, resourceOf(x => (x.kind === 'action' || x.kind === 'function') && x.name === from).key, to);
    } else next = api.prepareResourceRename(project, resourceOf(x => x.kind === (what === 'part' ? 'component' : 'data') && x.name === from).key, to);
  } catch (error) {
    // A case may expect the rename to be refused, with the reason it gives and the text it leaves as it was.
    if (c.expect.refused) return [...(c.expect.refusalContains ?? []).filter(word => !String(error.message).includes(word)).map(word => 'refusal lacks ' + word), ...sourceProblems(textOf(project.scripts))];
    return ['rename was refused: ' + (error.code || error.message)];
  }
  if (c.expect.refused) return ['rename was not refused'];
  return sourceProblems(textOf(next.scripts));
}

export async function runCase(api, c) {
  try {
    const problems = c.kind === 'format' ? formatResult(api, c) : c.kind === 'check' ? checkResult(api, c) : c.kind === 'run' ? runResult(api, c)
      : c.kind === 'file' ? await fileResult(api, c) : c.kind === 'rename' ? renameResult(api, c) : null;
    if (problems === null) return { id: c.id, status: 'NOT_RUN', detail: 'kind ' + c.kind + ' is not executed here' };
    return { id: c.id, status: problems.length ? 'FAIL' : 'PASS', ...(problems.length ? { detail: problems.join('; ') } : {}) };
  } catch (error) {
    return { id: c.id, status: 'FAIL', detail: 'exception: ' + (error.code || error.name) + ': ' + error.message };
  }
}
