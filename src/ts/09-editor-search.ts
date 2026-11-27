import { EVENT_BY_TYPE, cpLen, hintCandidates, resolveColor } from './02-language-contracts.ts';
import { buildSymbols } from './03-default-assets.ts';
import { SENTENCE_FORMS, parseSyntax, sentenceFormFor } from './04-syntax-expressions.ts';
import { inTurnAction, inTurnLabel, sentenceActorSource } from './04-syntax-sentences.ts';
import { BLOCK_SCHEMAS, BLOCK_SCHEMA_BY_ID, blockDecode, createBlock, syntaxSchema } from './05-command-presentation.ts';
import { formatScript } from './06-source-formatting.ts';
import { collectSignalNames } from './07-semantic-analysis-core.ts';
import { compileProject } from './07-semantic-analysis.ts';
import { BASIC_BLOCK_SCHEMA_IDS, searchReading } from './09-editor-sessions.ts';
import { BLOCK_SEARCH_SYNONYMS, configureSearchNode, hintSchemaId, holdFirst, keyedSearchCandidate, matchesSearch, nodeForSearchHint, searchIntent, searchKey, searchQueryVariants } from './09-editor-search-core.ts';
import { ASSIST_BUDGET_MS, ASSIST_DATA_KINDS, ASSIST_FULL_PARSE_CHARS, ASSIST_MAX, ASSIST_MAX_LINE_CHARS, assistCanonical, assistCreateRunState, assistDiagnosticEligible, assistEscapeRegex, assistKinds, assistKindsOps, assistSeeds, assistSourceRange, assistVerificationContext } from './09-assist-normalize.ts';
import { ASSIST_FAMILY_WORDS, ASSIST_SAY_WORDS, assistAstFrames, assistConditionEnds, assistDoneUntil, assistFamiliesWritten, assistKeepsCondition, assistKeepsWritten, assistListAllSaid, assistMeaningCompletions, assistMeaningFrames, assistMeaningMatch, assistNextSubject, assistWorkCheck } from './09-assist-verify.ts';
import { assistCompare, assistCompose, assistHintSearchSynonyms, assistSearch, assistSignalTransforms, assistSkeletonSources, assistStructuredTransforms, assistTransforms } from './09-assist-decompose.ts';
import type { AssistCandidate, AssistContext, AssistExtra, AssistListed, AssistMeaning, AssistNode, AssistPoolEntry, AssistRunState } from '../types/assist.d.ts';
import type { BlockSchema } from '../types/blocks.d.ts';
import type { Diagnostic } from '../types/compiled.d.ts';
import type { Proposal } from '../types/runtime.d.ts';
import type { Hint, SearchCandidate } from '../types/editor.d.ts';
import type { ParseContext, SentenceNode } from '../types/parse.d.ts';
import type { Project } from '../types/project.d.ts';
import type { ActorRef } from '../types/syntax-base.d.ts';
import type { Statement } from '../types/syntax.d.ts';

// ────────────────────────────────────────────────────────────────────────
// 09 — Editor search hints and code assist orchestration
// ────────────────────────────────────────────────────────────────────────

export function searchHintCandidates(candidates: Hint[], query: string, project?: Project | null, context: ParseContext = {}) {
  if (!query.trim()) return candidates;
  const intent = searchIntent(query, context);
  const matched = candidates.filter(h => intent
    ? (h.binding && matchesSearch(h.binding.name, query)) || hintSchemaId(h.id) === intent.schemaId
    : matchesSearch(h.text + ' ' + h.category + ' ' + h.searchTerms.join(' ') + ' ' + assistHintSearchSynonyms(h.id).join(' '), query));
  return matched.map(h => {
    if (!intent || !project) return h;
    try {
      const node = nodeForSearchHint(h, project, context, intent);
      return { ...h, text: formatScript({ kind: 'Script', body: [blockDecode(node) as Statement] }, { symbols: buildSymbols(project) }) };
    } catch (_) { return h; }
  }).sort((a, b) => Number(!!b.binding) - Number(!!a.binding) || holdFirst(b.id, query) - holdFirst(a.id, query));
}

export function blockSearchCandidates(project: Project, context: ParseContext, query: string, hints: Hint[]): SearchCandidate[] {
  const schemas = BLOCK_SCHEMAS.filter(s => !s.draftOnly && ['statement', 'expression'].includes(s.category));
  if (!query.trim()) return schemas;
  const intent = searchIntent(query, context);
  const out: SearchCandidate[] = [];
  const boundSchemas = new Set<string>();
  for (const hint of searchHintCandidates(hints, query, project, context)) {
    if (!hint.binding) continue;
    try {
      const candidateNode = nodeForSearchHint(hint, project, context, intent);
      const schema = BLOCK_SCHEMA_BY_ID.get(candidateNode.schemaId);
      if (!schema || !schemas.includes(schema)) continue;
      out.push({ ...schema, candidateNode, binding: hint.binding, searchLabel: hint.text, candidateKey: hint.id, candidateReason: hint.reason });
      boundSchemas.add(schema.id);
    } catch (_) { /* An unavailable incomplete hint remains visible through the generic schema. */ }
  }
  for (const schema of schemas) {
    if (boundSchemas.has(schema.id)) continue;
    const intended = intent && schema.id === intent.schemaId;
    if (!intended && !matchesSearch(blockPaletteSearchText(schema), query)) continue;
    const configured = intended && (intent.direction || intent.scale !== undefined || intent.index !== undefined || typeof intent.value === 'number' || !!intent.color || !!intent.empty);
    out.push(configured ? { ...schema, candidateNode: configureSearchNode(createBlock(schema.id, { draft: schema.inputs.some(s => s.type === 'target'), allowHoles: true }), intent) } : schema);
  }
  const words = searchQueryVariants(query).map(searchReading).filter(word => [...word].length >= 2 || word === searchReading(query));
  const marks = ['を', 'に', 'の', 'で', 'と', 'へ', 'が', 'は', 'て', '、', '・', 'びょう', 'かい', 'ばんめ'];
  const wordStart = (schema: SearchCandidate) => {
    const names = [schema.searchLabel, schema.label].filter(Boolean).map(searchReading);
    if (words.some(word => names.some(name => name.startsWith(word)))) return 0;
    return words.some(word => names.some(name => marks.some(mark => name.includes(mark + word)))) ? 1 : 2;
  };
  const kana = /[ぁ-ゟ゠-ヿ]/;
  const verb = /[うくぐすつぬぶむる]$/;
  const particles = marks.slice(0, 11);
  const found = (text: string, word: string) => {
    if (text === word) return 0;
    for (let at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + 1)) {
      const before = text.slice(0, at);
      const after = text[at + word.length];
      if ((!before || !/[\p{L}ー]$/u.test(before) || particles.some(mark => before.endsWith(mark))) && !(verb.test(word) && after && kana.test(after))) return 1;
    }
    return 2;
  };
  const quality = (schema: SearchCandidate) => {
    const own = [schema.searchLabel, schema.label, schema.binding?.name, ...((BLOCK_SEARCH_SYNONYMS[schema.id] || BLOCK_SEARCH_SYNONYMS[schema.kind]) || [])].filter(Boolean).map(searchReading);
    return Math.min(2, ...words.flatMap(word => own.map(text => found(text, word))));
  };
  const rank = (schema: SearchCandidate) => {
    if (intent && schema.id === intent.schemaId) return -1;
    const q = quality(schema);
    if (searchReading(query) === 'ひく' && ['NumericUpdate:SUB', 'BinaryExpression:SUB'].includes(schema.id)) return -1;
    return (q === 2 ? 60 : 0) + (BASIC_BLOCK_SCHEMA_IDS.has(schema.id) ? 0 : 30) + (q ? 10 : 0) + wordStart(schema);
  };
  out.splice(0, out.length, ...out.map((schema, i) => ({ schema, i, r: rank(schema) })).sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.schema));
  const key = searchKey(query);
  if (key) {
    const keyed = ['WaitUntil', 'RepeatUntil', 'SensorRead:KEY_DOWN'].map(id => keyedSearchCandidate(id, key, project)).filter(Boolean);
    out.splice(0, out.length, ...keyed, ...out.filter(s => !keyed.some(k => k.id === s.id)));
  }
  const rule = BLOCK_SCHEMA_BY_ID.get('ContinuousRule');
  if (rule && matchesSearch(blockPaletteSearchText(rule), query)) out.splice(holdFirst(rule.id, query) ? 0 : out.length, 0, rule);
  return out;
}

function assistListedSplits(listed: AssistListed, project: Project, ctx: AssistContext) {
  if (listed.rest === null) return [];
  const owner = project.components.find(c => c.id === ctx.targetId)?.name;
  const first = listed.parts.find(name => name !== owner && name !== '自分') ?? owner;
  const head = new RegExp('^「?' + assistEscapeRegex(first!) + '」?は、?');
  const waitLine = /^(?:[^、。]+は、?)?(\d+(?:\.\d+)?)秒待つ。?$/;
  const line = first + listed.particle + listed.rest + '。';
  const splits = new Map<string, string | undefined>();
  let found: string[] = [];
  try {
    const d = parseSyntax(line, ctx).syntaxDiagnostics[0];
    const fixes = (d?.proposals || []).filter(f => f.start === 0);
    const fixed = !d ? line : fixes.length === 1 ? fixes[0].source + line.slice(fixes[0].end) : null;
    const read = fixed && assistCanonical(fixed, ctx);
    found = read ? [read.text] : d ? assistCandidates(project, line, ctx, d).map(c => c.text) : [];
  } catch {}
  for (const text of found) {
    const [one, two, ...more] = text.trim().split('\n');
    const wait = waitLine.exec(one);
    const act = wait ? two : one;
    if (more.length || two !== undefined && !wait || act !== undefined && !head.test(act)) continue;
    const sentences = act === undefined ? [] : listed.parts.map(name => sentenceActorSource(name === '自分' ? { kind: 'self' } : { kind: 'named', name }) + 'は' + act.replace(head, ''));
    const split = [...(wait ? [wait[1] + '秒待つ。'] : []), ...sentences].join('\n');
    if (!splits.has(split)) splits.set(split, listed.parts.length > 1 ? inTurnLabel(wait ? 'この 本文で 待つ' : '文を 分ける', inTurnAction(sentences.join(''))) : undefined);
  }
  return [...splits].slice(0, ASSIST_MAX);
}

// Every near sentence is returned here: one that reads in the place it is offered, passes the work check there and keeps
// what was written (assistKeepsWritten). With none, nothing is offered.
export function assistCandidates(project: Project, basis: string, context: AssistContext & { key?: string; ownerKey?: string } = {}, diagnostic: Diagnostic | null = null): AssistCandidate[] {
  basis = String(basis).replace(/\r\n?/g, '\n');
  const ctx = assistVerificationContext({ ...context, symbols: context.symbols || buildSymbols(project) });
  const state = assistCreateRunState();
  const origEnds = new WeakMap<AssistCandidate, number>();
  const kept = (list: AssistCandidate[]) => {
    const rows = list.map(c => {
      const sentence = c.sentence ?? c.text;
      const ast = assistCanonical(sentence, ctx, basis.slice(0, c.start).trimEnd().split('\n').at(-1) || '')?.ast ?? null;
      const written = basis.slice(c.start, origEnds.get(c) ?? c.end);
      return { c, sentence, ast, written, again: !!ast && /"kind":"RepeatUntil"/.test(JSON.stringify(ast)) };
    }).filter(r => assistKeepsWritten(project, r.written, r.sentence, r.ast, ctx) && assistWorkCheck(project, basis, context, r.c.start, r.c.end, r.c.source, state.workCheckCache));
    return rows.filter(r => !assistDoneUntil(r.written, project) || r.again || rows.some(o => o.again)).map(r => r.c);
  };
  const found = kept(assistCandidatesAsWritten(project, basis, context, diagnostic, state, origEnds));
  if (found.length || context.meijin || cpLen(basis) > ASSIST_FULL_PARSE_CHARS) return found;
  let first = diagnostic;
  try { if (!first) first = parseSyntax(basis, context).syntaxDiagnostics[0]; } catch { return []; }
  const range = first?.line && !first.proposals?.length ? assistSourceRange(basis, first, ctx) : null;
  if (!range || cpLen(basis.slice(range.lineStart + range.indent, range.lineEnd)) > ASSIST_MAX_LINE_CHARS) return [];
  // A condition written without 、 after it (星にさわったら消える) is looked for as written with it (星にさわったら、消える).
  for (const offset of assistConditionEnds(range.text, project)) {
    if (state.parsesRemaining <= 0) break;
    const at = range.start + offset;
    if (offset >= range.text.length || basis[at] === '、') continue;
    const made = kept(assistCandidatesAsWritten(project, basis.slice(0, at) + '、' + basis.slice(at), context, null, state, origEnds).filter(c => c.start <= at && c.end > at).map(c => {
      const shifted = { ...c, end: c.end - 1 };
      const orig = origEnds.get(c);
      if (orig !== undefined) origEnds.set(shifted, orig > at ? orig - 1 : orig);
      return shifted;
    }));
    if (made.length) return made;
  }
  // A が written for を (「星」までのきょりが言う) is the sentence with を there when that reads and keeps what was written.
  const plain = range.text.replace(/「[^「」]*」|『[^『』]*』|【[^【】]*】/g, (q: string) => '＿'.repeat(q.length));
  for (let at = plain.indexOf('が'); at >= 0; at = plain.indexOf('が', at + 1)) {
    if (state.parsesRemaining <= 0) break;
    state.parsesRemaining--;
    const source = range.text.slice(0, at) + 'を' + range.text.slice(at + 1);
    const canonical = assistCanonical(source, ctx);
    const node = canonical?.ast.body?.[0];
    let reads = false;
    try { reads = !!parseSyntax(basis.slice(0, range.start) + source + basis.slice(range.end), context).ast; } catch {}
    if (!reads || !canonical || !node) continue;
    const made = kept([{ assist: true, schemaId: syntaxSchema(node)?.id || node.kind, origin: 'S2', label: source.replace(/。$/, ''), text: canonical.text, source, start: range.start, end: range.end }]);
    if (made.length) return made;
  }
  return [];
}

function assistCandidatesAsWritten(project: Project, basis: string, context: AssistContext & { key?: string; ownerKey?: string } = {}, diagnostic: Diagnostic | null = null, runState?: AssistRunState, origEnds?: WeakMap<AssistCandidate, number>): AssistCandidate[] {
  basis = String(basis).replace(/\r\n?/g, '\n');
  const ctx = assistVerificationContext({ ...context, symbols: context.symbols || buildSymbols(project) });
  if (context.meijin || cpLen(basis) > ASSIST_FULL_PARSE_CHARS) return [];
  let first = diagnostic;
  try { if (!first) first = parseSyntax(basis, context).syntaxDiagnostics[0]; } catch { return []; }
  if (!assistDiagnosticEligible(first, basis)) return [];
  const state = runState || assistCreateRunState();
  const existing = first!.proposals || (first as Diagnostic & { choices?: Proposal[] }).choices || [];
  const range = assistSourceRange(basis, first!, ctx);
  if (!range || cpLen(basis.slice(range.lineStart + range.indent, range.lineEnd)) > ASSIST_MAX_LINE_CHARS) return [];
  if (existing.length && !existing.every(p => /【([^】]+)】という(?:手順|てじゅん)を行う/.test(p.source) && !range.text.includes(/【([^】]+)】/.exec(p.source)?.[1]!))) return [];
  const data = assistSeeds(range.text, ctx.symbols, ctx);
  if (!data.text || /^(?:※|\s*$)/.test(data.text) || !/(?:何|なに)も(?:しない|せず|ない|しなくてよい)$/.test(data.text) && /(?:ません|ない|ず|[うくぐすつぬぶむる]な)$/.test(data.text)) return [];
  if (data.headerEvent && (ctx.definitionKind || ctx.targetId === 'stage' || data.headerEvent !== 'valueChanged' && data.subject && data.subject !== project.components.find(c => c.id === ctx.targetId)?.name && !['自分', '体'].includes(data.subject) || data.headerEvent === 'click' && data.names.some(n => n.kind === 'part' && project.components.some(c => c.name === n.name && c.id !== ctx.targetId)))) return [];
  if (data.subjects && ctx.targetId === 'stage') {
    const part = project.components.find(c => data.subjects!.parts.includes(c.name));
    return part ? assistCandidates(project, basis, { ...context, targetId: part.id, targetType: part.type }, null).filter(c => !!parseSyntax(basis.slice(0, c.start) + c.source + basis.slice(c.end), context).ast && assistWorkCheck(project, basis, context, c.start, c.end, c.source, state.workCheckCache)) : [];
  }
  if (/^(?:\d+(?:\.\d+)?秒ごとに|毎秒)、.+は$/.test(data.text) && !new RegExp('、(?:自分|' + assistEscapeRegex(project.components.find(c => c.id === ctx.targetId)?.name || '') + ')は$').test(data.text)) return [];
  if (/^「([^「」]+)」が\d+回/.test(data.text) && !project.components.some(c => c.name === /^「([^「」]+)」/.exec(data.text)![1])) return [];
  if (/^もし/.test(data.text) && /以上と|以下と/.test(data.text)) return [];
  if (!ctx.signalNames) { try { ctx.signalNames = collectSignalNames(compileProject(project)); } catch { ctx.signalNames = { sent: [], received: [] }; } }
  const previous = basis.slice(0, range.start).trimEnd().split('\n').at(-1) || '';
  const pool: AssistPoolEntry[] = [];
  const add = (text: string, origin: string, layer: number, extra: AssistExtra = {}) => {
    if (data.clauses.length > 1 && /(?:たら|れば|なら|とき|あいだ|まで)$/.test(data.clauses[0].text) && /、$/.test(String(text).trim()) && !data.clauses.slice(1).every(c => [project.components.find(c => c.id === ctx.targetId)?.name + 'は', '自分は'].includes(c.text))) return;
    const canonical = assistCanonical(text, ctx, previous);
    if (!canonical) return;
    const node = canonical.ast.body?.[0] || canonical.ast.rules?.[0];
    const schemaId = extra.schemaId || (canonical.ast.heading ? 'Heading:' + canonical.ast.heading.event : node ? syntaxSchema(node)?.id || node.kind : null);
    if (!schemaId) return;
    if (origin === 'S2' && /のところ(?:へ|に|まで)(?:走|はし|とぶ|動)/.test(data.text) && node?.kind === 'MotionCommand' && node.op !== 'GOTO_PART') return;
    if (schemaId === 'Heading:touchStart' && data.subject === project.components.find(c => c.id === ctx.targetId)?.name && canonical.ast.heading?.actorRef?.kind !== 'named') return;
    if (data.clauses.length > 1 && /あいだ$/.test(data.clauses[0].text) && (canonical.ast.body?.length || 0) < 2 && ![...(canonical.ast.body || []), ...(canonical.ast.rules || [])].some(n => ['ContinuousRule', 'IfStatement', 'RepeatWhile', 'RepeatUntil', 'RepeatCount'].includes(n.kind)) && !searchReading(canonical.text).startsWith(searchReading(data.clauses[0].text))) return;
    if (extra.fromDiagnosis && !/(?:とき(?:は)?|たら|れば|なら|あいだ|まで)$/.test(data.clauses.at(-1)?.text || data.text)) {
      let last: SentenceNode | undefined = canonical.ast.body?.at(-1) || node;
      while (last?.thenBody?.length || last?.body?.length) last = (last.thenBody?.length ? last.thenBody : last.body!).at(-1);
      const lastSchema = last ? syntaxSchema(last)?.id || last.kind : schemaId;
      const terms = hintCandidates(project, ctx.targetId, { ...ctx, source: basis, start: range.lineStart + range.indent, end: range.lineEnd }).filter(h => hintSchemaId(h.id).replace(/:timed$/, '') === lastSchema).flatMap(h => [h.text, ...h.terms?.synonyms || [], ...h.terms?.verbForms || []]);
      const main = assistSeeds(data.clauses.at(-1)?.text || data.text, ctx.symbols, ctx).seeds.filter(seed => seed.text.length >= 2 && /[うくぐすつぬぶむる]$/.test(seed.text));
      if (main.length && !main.some(seed => matchesSearch(terms.join(' '), seed.text))) return;
    }
    pool.push({ text: canonical.text, schemaId, label: BLOCK_SCHEMA_BY_ID.get(schemaId)?.label || canonical.text, origin, layer, rank: 0, filled: 0, order: pool.length, start: extra.start ?? range.start, end: extra.end ?? range.end, ast: canonical.ast, ...extra });
  };

  // Stage 1–3: Skeleton synthesis first (layer 1), followed by structured/general transforms & compose (layer 2).
  const skeletonEntries = assistSkeletonSources(range.text, project, ctx, basis, range, state);
  const want = assistMeaningFrames(data, project, ctx, range.text);
  const composed = assistCompose(project, basis, range, ctx, data, !!want, state);

  const tryTransformEntry = (entry: string | { text: string; schemaId?: string; description?: string; start?: number; end?: number; whole?: boolean }, layer: number) => {
    const variant = typeof entry === 'string' ? entry : entry.text;
    const isWhole = typeof entry === 'object' && !!entry.whole;
    const hasCustomSpan = typeof entry === 'object' && !isWhole && entry.start !== undefined && entry.end !== undefined;
    const entryStart = hasCustomSpan ? entry.start! : range.start;
    const entryEnd = hasCustomSpan ? entry.end! : range.end;
    const replacement = isWhole ? variant : variant.replace(/\n/g, () => '\n' + ' '.repeat(range.indent));
    const written = replacement.endsWith('。') && basis[entryEnd] === '。' ? replacement.slice(0, -1) : replacement;
    const changedEnd = entryStart + written.length;
    const delta = written.length - (entryEnd - entryStart);
    let parsed: ReturnType<typeof parseSyntax>;
    try {
      const candidateBasis = isWhole ? replacement : basis.slice(0, entryStart) + replacement + (replacement.endsWith('。') && basis[entryEnd] === '。' ? basis.slice(entryEnd + 1) : basis.slice(entryEnd));
      parsed = parseSyntax(candidateBasis, ctx);
    } catch { return; }
    const from = basis.slice(0, isWhole ? 0 : entryStart).split('\n').length;
    const to = from + replacement.split('\n').length - 1;
    const next = parsed.syntaxDiagnostics[0];
    const outside = next && !['P208', 'F504'].includes(next.code) && (next.line < from || next.line > to);
    if (parsed.ast || outside) {
      add(variant, 'S2', layer, typeof entry === 'string'
        ? (/。\s+※/.test(variant) ? { schemaId: 'CommentLine' } : {})
        : { ...(entry.schemaId ? { schemaId: entry.schemaId } : {}), ...(entry.description ? { description: entry.description } : {}), ...(isWhole || hasCustomSpan ? { start: entry.start, end: entry.end } : {}) });
    } else if (!hasCustomSpan) {
      for (const p of parsed.syntaxDiagnostics[0]?.proposals as (Proposal & { start: number; end: number })[] | undefined || []) {
        if (p.start > changedEnd || p.end < entryStart) continue;
        const action = /【([^】]+)】という(?:手順|てじゅん)を行う/.exec(p.source);
        if (action && !data.text.includes(action[1])) continue;
        const start = p.start <= entryStart ? p.start : p.start >= changedEnd ? p.start - delta : entryStart;
        const end = p.end <= entryStart ? p.end : p.end >= changedEnd ? p.end - delta : entryEnd;
        add(p.source, 'S2', layer, { label: p.label, start, end, fromDiagnosis: true });
      }
    }
  };

  for (const entry of skeletonEntries.high) tryTransformEntry(entry, 1);
  for (const entry of [...assistStructuredTransforms(data.text, data, project, ctx, basis, range, state), ...assistTransforms(data.text, data, project, ctx), ...composed.sources, ...skeletonEntries.normal]) tryTransformEntry(entry, 2);

  for (const entry of assistSignalTransforms(data.text, project, ctx, basis, range)) {
    add(entry.text, 'S4', 3, { schemaId: entry.schemaId, ...(entry.description ? { description: entry.description } : {}), ...(entry.end !== undefined ? { end: entry.end } : {}) });
  }

  const allSearched = assistSearch(project, basis, range, ctx, data, state);
  const searched = composed.composed ? allSearched.filter(h => searchReading(h.text.split('\n')[0].replace(/。$/, '')) === searchReading(data.text)) : allSearched;
  const signalGroup = pool.some(p => p.schemaId === 'WaitBroadcastGroup');
  const signalHeading = pool.filter(p => p.origin === 'S4' && p.schemaId === 'Heading:message');
  const directedSignal = pool.some(p => p.origin === 'S4' && p.schemaId === 'Broadcast') && !/と(?:言う|話す|いう)$/.test(data.text);
  const ownStop = pool.some(p => p.schemaId === 'StopCommand:OWN_OTHERS' && p.text.includes('\n'));
  const otherStop = data.names.some(n => n.kind === 'part' && project.components.some(c => c.name === n.name && c.id !== ctx.targetId)) && /止まる|止める|とまる|とめる/.test(data.text);
  pool.push(...searched.filter(h =>
    (!signalGroup || !['Broadcast', 'BroadcastAndWait'].includes(h.schemaId)) &&
    (!signalHeading.length || h.schemaId !== 'Heading:message' || signalHeading.some(p => p.text === h.text)) &&
    (!directedSignal || h.schemaId !== 'Say') &&
    (!ownStop || h.schemaId !== 'StopCommand:OWN_OTHERS') &&
    (!otherStop || !['StopCommand:THIS', 'StopCommand:OWN_OTHERS', 'SoundCommand:STOP_ALL'].includes(h.schemaId))
  ).map(h => ({ ...h, start: range.start, end: range.end })));

  if (data.subjects) for (const [text, label] of assistListedSplits(data.subjects, project, ctx)) add(text, 'S2', 2, { label, listed: true });
  pool.sort((a, b) => assistCompare(a, b, ctx));
  if (data.subjects) pool.splice(0, pool.length, ...pool.filter(p => p.listed));

  const partNames = project.components.map(c => c.name);
  const partial: (AssistCandidate & { meaning?: AssistMeaning })[] = [];
  const meaningOf = (text: string) => {
    const canonical = assistCanonical(text, ctx, previous);
    return canonical ? { text: canonical.text, meaning: assistMeaningMatch(want, assistAstFrames(canonical.ast, project, ctx)) } : null;
  };
  if (want) {
    for (let i = pool.length - 1; i >= 0; i--) {
      const made = assistMeaningCompletions(pool[i].text, want, partNames);
      if (!made.length) continue;
      const from = meaningOf(pool[i].text)?.meaning;
      pool.splice(i, 0, ...(made.map(meaningOf).filter(c => c?.meaning && (!from || c.meaning.missing < from.missing || c.meaning.explicit && !from.explicit)) as { text: string; meaning: AssistMeaning }[]).map(({ text }) => ({ ...pool[i], text, ast: null, label: pool[i].label === pool[i].text ? text : pool[i].label })));
    }
  }
  const now=()=>globalThis.performance?.now?.()??Date.now();
  const contextHints = hintCandidates(project, ctx.targetId, { ...ctx, source: basis, start: range.lineStart + range.indent, end: range.lineEnd });
  const knownSchemas = new Set(contextHints.filter(h => h.mode === 'statement').map(h => hintSchemaId(h.id).replace(/:timed$/, '')));
  const hasHigher = pool.some(p => p.layer < 6);
  const seen = new Set(existing.map(p => p.source.replace(/[\s。]/g, '')));
  const out: (AssistCandidate & { meaning?: AssistMeaning })[] = [];
  const started = now();
  const topic: { before?: ActorRef | null } = {};
  const familyNamed = Object.values(ASSIST_FAMILY_WORDS).some(w => w.test(data.text.replace(/「[^「」]*」|『[^『』]*』/g, '')));
  let unread: string | null = null;
  let nearest: Set<string> | null = null;
  const conditionWritten = /^もし/.test(data.text) || assistConditionEnds(range.text, project).length > 0;
  for (const p of pool) {
    if (p.layer === 6 && hasHigher) continue;
    const key = p.text.replace(/[\s。]/g, '');
    if (key === range.text.replace(/[\s。]/g, '') || seen.has(key)) continue;
    const canonical = assistCanonical(p.text, ctx, previous);
    if (!canonical) continue;
    const expandedSpan = p.start !== range.start || p.end !== range.end;
    const effectiveWant = expandedSpan ? null : want;
    const frames = assistAstFrames(canonical.ast, project, ctx);
    const meaning = assistMeaningMatch(effectiveWant, frames);
    if (!meaning) continue;
    if (conditionWritten && !assistKeepsCondition(canonical.ast, range.text, assistConditionEnds(p.text, project).length > 0, project, ctx)) continue;
    if (assistListAllSaid(data) && canonical.ast.body?.[0]?.kind !== 'ForEach') continue;
    if (!effectiveWant && !ASSIST_SAY_WORDS.test(range.text) && frames?.some(f => f.said.some(v => v !== '' && !basis.includes(v)))) continue;
    if (meaning.nameOnly && unread !== null && meaning.actions !== unread) continue;
    if (!effectiveWant && !assistFamiliesWritten(canonical.ast, data, new Set([...Object.keys(ASSIST_FAMILY_WORDS).filter(k => k !== 'SoundCommand'), ...familyNamed ? [] : ASSIST_DATA_KINDS]))) continue;
    if (!effectiveWant && !ASSIST_FAMILY_WORDS.PenCommand.test(data.text.replace(/「[^「」]*」|『[^『』]*』/g, '')) && assistKindsOps(canonical.ast).some(k => ['PenCommand:UP', 'PenCommand:DOWN', 'PenCommand:SET_SIZE'].includes(k))) continue;
    if (!effectiveWant && !/タイマー|たいまー|秒|びょう|時間|じかん/.test(data.text.replace(/「[^「」]*」|『[^『』]*』/g, '')) && assistKindsOps(canonical.ast).some(k => k.startsWith('TimerReset'))) continue;
    if (effectiveWant && (nearest ? !assistFamiliesWritten(canonical.ast, data, nearest) : effectiveWant.some(f => f.objects?.length) && !assistFamiliesWritten(canonical.ast, data, new Set(), true))) continue;
    const allowed = p.allowedSchemas || new Set(contextHints.filter(h => h.mode === 'statement' && h.enabled).map(h => hintSchemaId(h.id)));
    const localNames = new Set([...(ctx.args || []), ...(ctx.localNames || [])]);
    const knownFor = (actor: string | null | undefined) => new Set([...(project.projectData?.variables || []), ...(project.projectData?.lists || []), ...(project.components.find(c => c.id === actor)?.localData?.variables || []), ...(project.components.find(c => c.id === actor)?.localData?.lists || [])].map(n => n.name));
    const gather = (node: AssistNode) => {
      if (!node || typeof node !== 'object') return;
      if (['LocalVariableDeclaration', 'LocalListDeclaration'].includes(node.kind)) localNames.add(node.name!);
      if (node.kind === 'ForEach') localNames.add(node.binder!);
      for (const [k, v] of Object.entries(node)) if (k !== 'sourceSpan' && v && typeof v === 'object') Array.isArray(v) ? (v as AssistNode[]).forEach(gather) : gather(v as AssistNode);
    };
    gather(canonical.ast);
    let forbidden = false;
    const visit = (node: AssistNode | AssistNode[], actor: string | null | undefined = ctx.targetId) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach(n => visit(n, actor)); return; }
      if (node.actorRef?.kind === 'named') actor = project.components.find(c => c.name === node.actorRef!.name)?.id;
      else if (node.actorRef?.kind === 'self') actor = ctx.targetId;
      const knownNames = knownFor(actor);
      const form = sentenceFormFor(node as SentenceNode);
      if (form) {
        const schema = syntaxSchema(node)?.id || node.kind;
        if (!form.allowedContexts.includes(ctx.definitionKind || 'script') || (knownSchemas.has(schema) || ctx.definitionKind === 'function') && !allowed.has(schema)) forbidden = true;
      }
      if (node.heading) {
        const ref = node.heading.actorRef;
        const owner = ref?.kind === 'named' ? project.components.find(c => c.name === ref.name) : project.components.find(c => c.id === ctx.targetId);
        if (!owner || !EVENT_BY_TYPE[owner.type]?.includes(node.heading.event)) forbidden = true;
      }
      if (['VariableRead', 'ListRead'].includes(node.kind) && !knownNames.has(node.name) && !localNames.has(node.name)) forbidden = true;
      if (['Assignment', 'NumericUpdate', 'ListAppend', 'ListInsert', 'ListReplace', 'ListDelete', 'ListClear'].includes(node.kind) && node.target?.name && !knownNames.has(node.target.name) && !localNames.has(node.target.name)) forbidden = true;
      if (node.kind === 'UserActionCall' && !project.actions.some(a => a.name === node.name)) forbidden = true;
      if (node.kind === 'UserFunctionCall' && !project.functions.some(a => a.name === node.name)) forbidden = true;
      if (node.actorRef?.kind === 'named' && !project.components.some(c => c.name === node.actorRef!.name)) forbidden = true;
      if (node.kind === 'MotionCommand' && ['GOTO_PART', 'POINT_TO'].includes(node.op) && node.args?.[0]?.kind === 'StringLiteral' && !project.components.some(c => c.name === node.args![0]!.value) && node.args[0].value !== 'マウス') forbidden = true;
      if (node.kind === 'SoundCommand' && ['SAMPLE', 'SAMPLE_WAIT'].includes(node.op) && node.args?.[0]?.kind === 'StringLiteral' && !project.sounds.some(c => c.name === node.args![0]!.value)) forbidden = true;
      if (node.kind === 'LooksCommand' && node.op === 'SET_COSTUME' && node.args?.[0]?.kind === 'StringLiteral' && !project.components.find(c => c.id === actor)?.costumes?.some(c => c.name === node.args![0]!.value)) forbidden = true;
      if (node.kind === 'LooksCommand' && node.op === 'SET_COLOR' && node.args?.[0]?.kind === 'StringLiteral') try { resolveColor(node.args[0].value as string); } catch { forbidden = true; }
      for (const [k, v] of Object.entries(node)) if (k !== 'sourceSpan' && v && typeof v === 'object') visit(v as AssistNode, actor);
    };
    visit(canonical.ast);
    if (p.schemaId?.startsWith('Heading:')) forbidden = forbidden || !!ctx.definitionKind || ctx.targetId === 'stage';
    if (forbidden) continue;
    const start = p.start ?? range.start;
    const pEnd = p.end ?? range.end;
    const written = (p.text.endsWith('。') && basis[pEnd] === '。' ? p.text.slice(0, -1) : p.text).replace(/\n/g, () => '\n' + ' '.repeat(range.indent));
    const keptNext = assistNextSubject(basis, start, pEnd, written, range.indent, ctx, project, topic);
    const end = keptNext ? (basis + '\n').indexOf('\n', keptNext.at) : pEnd;
    const shown = keptNext && assistCanonical((written + keptNext.between + basis.slice(keptNext.at, end)).replace(new RegExp('\\n[ \\t]{0,' + range.indent + '}', 'g'), '\n'), ctx, previous);
    if (keptNext && !shown) continue;
    const text = shown ? shown.text : p.text;
    const source = shown ? text.replace(/\n/g, () => '\n' + ' '.repeat(range.indent)) : written;
    const replacement = basis.slice(0, start) + source + basis.slice(end);
    let valid = false;
    const following = basis.slice(end).split('\n').slice(1).find(line => line.trim() && line.match(/^\s*/)![0].length <= range.indent);
    if (following && /^そうでなければ、/.test(following.trim()) && canonical.ast.body?.[0]?.kind !== 'IfStatement') continue;
    try {
      const parsed = parseSyntax(replacement, ctx);
      const next = parsed.syntaxDiagnostics[0];
      const from = basis.slice(0, start).split('\n').length;
      const to = from + source.split('\n').length - 1;
      valid = !!parsed.ast || next && !['P208', 'F504'].includes(next.code) && (next.line < from || next.line > to || next.code === 'P202' && next.line === from);
    } catch {}
    valid = valid && assistWorkCheck(project, basis, context, start, end, source, state.workCheckCache);
    if (valid) {
      const label = (p.label || BLOCK_SCHEMA_BY_ID.get(p.schemaId)?.label || p.text).replace(/いまのばしょから/g, 'いまの ばしょから').replace(/決めたばしょへ/g, '決めた ばしょへ').replace(/始まったことが/g, '始まった ことが');
      seen.add(key);
      if (meaning.actions !== undefined) unread ??= meaning.actions;
      nearest ??= assistKinds(canonical.ast);
      const cand: AssistCandidate & { meaning?: AssistMeaning } = { assist: true, schemaId: p.schemaId, origin: p.origin, label, text, ...(shown ? { sentence: p.text } : {}), source, start, end, ...(p.description || keptNext ? { description: [p.description, keptNext?.note].filter(Boolean).join(' ') } : {}), ...(effectiveWant ? { meaning } : {}) };
      if (keptNext && origEnds) origEnds.set(cand, pEnd);
      (meaning.missing ? partial : out).push(cand);
    }
    const taken = out.length + partial.length;
    if (taken >= ASSIST_MAX || !hasHigher && taken >= 2 || now() - started > ASSIST_BUDGET_MS) break;
  }
  if (!want) return out;
  const shownList = (out.length ? [...out.filter(c => !c.meaning || c.meaning.explicit), ...out.filter(c => c.meaning && !c.meaning.explicit)] : partial.sort((a, b) => a.meaning!.missing - b.meaning!.missing)).slice(0, hasHigher ? ASSIST_MAX : 2);
  if (!shownList.length && ctx.targetId === 'stage' && want?.length && want.every(w => w.subject && w.subject === want[0].subject)) {
    const part = project.components.find(c => c.name === want[0].subject);
    const named = part && sentenceActorSource({ kind: 'named', name: part.name }) + 'は';
    const seenText = new Set<string>();
    if (part) {
      return assistCandidates(project, basis, { ...context, targetId: part.id, targetType: part.type }, null)
        .map(c => c.text.includes('\n') || c.text.startsWith(named!) ? c : { ...c, text: named + c.text, source: named + c.source, label: c.label === c.text ? named + c.text : c.label })
        .filter(c => {
          const sentence = c.sentence ?? c.text;
          if (seenText.has(sentence)) return false;
          seenText.add(sentence);
          try { return sentence.split('\n').every(line => line.startsWith(named!)) && !!parseSyntax(basis.slice(0, c.start) + c.source + basis.slice(c.end), context).ast && assistWorkCheck(project, basis, context, c.start, c.end, c.source, state.workCheckCache); } catch { return false; }
        });
    }
  }
  return shownList.map(entry => {
    const { meaning, ...candidate } = entry;
    void meaning;
    const orig = origEnds?.get(entry);
    if (orig !== undefined) origEnds!.set(candidate, orig);
    return candidate;
  });
}

export function blockPaletteSearchText(schema: Pick<BlockSchema, 'label' | 'id' | 'kind' | 'palette'>) {
  const words = [schema.label, schema.id, schema.kind, schema.palette, ...((BLOCK_SEARCH_SYNONYMS[schema.id] || BLOCK_SEARCH_SYNONYMS[schema.kind]) || [])];
  const operation = schema.id.includes(':') ? schema.id.slice(schema.id.indexOf(':') + 1) : null;
  for (const form of SENTENCE_FORMS) {
    if (form.kind !== schema.kind || (form.op && operation && form.op !== operation)) continue;
    words.push(form.intent, ...(['MotionCommand', 'NumericUpdate'].includes(schema.kind) ? [] : form.verbForms || []), ...(form.nounForms || []).filter(word => word !== '動く対象'), ...(form.acceptedReadings || []));
  }
  return words.filter(Boolean).join(' ').toLocaleLowerCase();
}

// Keep the initial prefix and explicitly revealed distant pages together.
// A focus jump must not materialize every intervening statement.
export function blockBodyRanges(length: number, prefixPage: number, extraPages: Iterable<number> | null | undefined, pageSize = 60) {
  const ranges = [[0, Math.min(length, (prefixPage + 1) * pageSize)]];
  for (const page of extraPages || []) {
    if (Number.isInteger(page) && page >= 0 && page * pageSize < length) ranges.push([page * pageSize, Math.min(length, (page + 1) * pageSize)]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: number[][] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}
