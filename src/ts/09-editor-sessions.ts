import { AkariError, EVENT_BY_TYPE, LIMITS, cpLen, decodeBase64, hintCandidates, isEdgeTarget, isMeijinScript, keySurface, makeImmutableAssetRecord, normalizeSource, splitComment, validateName } from './02-language-contracts.ts';
import { dangoMascotAssetRecord, defaultMascotAssetRecord, makeEmptyProject } from './03-default-assets-core.ts';
import { buildSymbols } from './03-default-assets.ts';
import { formatCondition, isConditionValue, parseSyntax } from './04-syntax-expressions.ts';
import { EVERYONE_WAITS, STATEMENT_EXPLICIT_ACTORS, readSentenceHeading, sentenceActorSource, sentenceHeadingSource } from './04-syntax-sentences.ts';
import { indentWidth, parseScript } from './04-syntax-scripts.ts';
import { BLOCK_SCHEMA_BY_ID, PREC, blockDecode, blockEncode, createBlock } from './05-command-presentation.ts';
import { formatExpression, formatScript, formatTarget } from './06-source-formatting.ts';
import { DIAGNOSTIC_JUDGED, EVENT_COUNT_PLACE_MESSAGE, scriptBySourceKey, updateScriptSource } from './07-semantic-analysis-core.ts';
import { analyzeAst, astEquivalent, stableJson } from './07-semantic-analysis.ts';
import type { BlockIndexEntry, BlockLocation, BlockOperation, BlockSchema, BlockTree, EncodedBlocks, IndexWalk, InsertLocation, InsertionAvailability } from '../types/blocks.d.ts';
import type { Diagnostic, Symbols } from '../types/compiled.d.ts';
import type { BlockEditOptions, EditorContext, EditorSession, Hint, PendingEdit, SearchIntent, SourceEdit, TutorialFacts, TutorialState, TutorialStep, TutorialStepInput } from '../types/editor.d.ts';
import type { AssetRecord } from '../types/runtime.d.ts';
import type { ActionDefinitionData, Backdrop, Costume, DataSet, EventName, FunctionDefinitionData, Project, ProjectScript, Sound } from '../types/project.d.ts';
import type { SentenceRanges, SourceRanges, TreeNode } from '../types/parse.d.ts';
import type { ActorRef, Heading } from '../types/syntax-base.d.ts';
import type { Expression, Rule, Script, Statement, StringLiteral, Target } from '../types/syntax.d.ts';

// ────────────────────────────────────────────────────────────────────────
// 09 — Pure editor sessions, atomic block transactions and the search readings
// ────────────────────────────────────────────────────────────────────────
export function editorError(message: string): never {
  throw new AkariError('E901', message);
}
const PLACE_UNFIT_MESSAGE = 'その ブロックは そこには 入れられないよ。合う ばしょを えらんでね。';
// An empty text is no name: a value put where a name is read does not go in empty.
const EMPTY_NAME_MESSAGE = 'からっぽの 文字は 名前に ならない ので、そこには 入れられないよ。名前を 書いた 文字を 入れてね。';
// The line a memo field belongs to, for a memo whose line is written only with that field (when).
const MEMO_LINE_WORDS: { readonly [when: string]: string } = { heading: '見出しの 行', hasElse: '「そうでなければ」の 行' };
// The changes that put a value into a hole of a block.
function placesValue(op: BlockOperation): boolean {
  return op.type === 'expression' || op.type === 'variadic-insert' || op.type === 'expression-move' ||
    (op.type === 'replace' && BLOCK_SCHEMA_BY_ID.get(op.node?.schemaId)?.category === 'expression');
}
// The edits refused because the text written from the blocks does not read back as them, and whether the words are the
// reader's. They tell of a text the child did not write, so a place's check gives the block's own reason instead.
const UNREAD_EDITS = new WeakMap<object, boolean>();
function unreadError(message: string, readerWords: boolean): never {
  const error = new AkariError('E901', message);
  UNREAD_EDITS.set(error, readerWords);
  throw error;
}
// Inner consistency checks: the child sees a retry message; the check text stays in the details.
function editorCheckError(detail: string): never {
  throw new AkariError('E901', 'うまく いかなかったよ。もう一度 やって みてね。', 0, 0, detail);
}
function editorOwner(ownerKey: string): string {
  if (typeof ownerKey !== 'string' || !/^(script|action|function):.+/.test(ownerKey))
    editorCheckError('本文の所有者が不正です');
  return ownerKey.split(':')[0];
}
function editorContext(ownerKey: string, context: EditorContext = {}): EditorContext {
  return { ...context, key: ownerKey, ownerKey };
}
function editorDiagnostics(ast: Script, project: Project, context: EditorContext): Diagnostic[] {
  const header: Diagnostic[] = [],
    definition = context.definition;
  const report = (code: string, message: string) =>
    header.push({ code, message, line: 0, column: 1, where: context.ownerKey });
  let analysisContext = context;
  if (context.definitionKind) {
    if (!definition) editorCheckError('定義の 下書きが ありません');
    try {
      validateName(definition.name, { callable: true });
    } catch (error) {
      // (validateName throws an AkariError)
      report('S302', (error as Error).message);
    }
    const supplied = context.args ?? definition.args,
      args = Array.isArray(supplied) ? supplied : [];
    if (!Array.isArray(supplied) || args.length > LIMITS.args)
      report('S308', '入れるものの 数が 多すぎるか、書き方が まちがって います。入れるものを へらすか、書き方を たしかめて ください。');
    const names = new Set<string>();
    for (const name of args) {
      try {
        validateName(name);
      } catch (error) {
        report('S302', (error as Error).message);
      }
      if (names.has(name)) report('S302', '入れるものに 同じ 名前が 2つ いじょう あります。ちがう 名前に して ください');
      names.add(name);
    }
    analysisContext = { ...context, args };
  }
  return [...header, ...analyzeAst(ast, project, analysisContext)];
}
export function createEditorSession(ownerKey: string, source: string, context: EditorContext = {}, project: Project | undefined, contextRevision = 0): EditorSession {
  const ownerKind = editorOwner(ownerKey);
  if (!Number.isSafeInteger(contextRevision) || contextRevision < 0)
    editorCheckError('文脈の世代が不正です');
  const ctx = editorContext(ownerKey, context),
    parsed = parseSyntax(source, { ...ctx, ...(project ? {symbols:buildSymbols(project)} : {}) }),
    // A 名人 script is code only.
    encoded = parsed.ast && !ctx.meijin ? blockEncode(parsed.ast) : null;
  return {
    ownerKey,
    ownerKind,
    mode: 'code',
    sourceText: source,
    sourceRevision: 0,
    contextRevision,
    context: ctx,
    project,
    syntaxAst: parsed.ast,
    syntaxDiagnostics: parsed.syntaxDiagnostics,
    diagnostics:
      parsed.ast && project
        ? editorDiagnostics(parsed.ast, project, ctx)
        : parsed.syntaxDiagnostics,
    blockView: encoded?.tree || null,
    nodeMap: encoded?.nodeMap || new Map<string, BlockLocation>(),
    nodeIds: encoded?.nodeIds || new WeakMap<object, string>(),
    codeSelection: { start: 0, end: 0 },
    blockSelection: null,
    scrollState: {},
    pendingEdit: null,
    nextBlockId: 1,
  };
}
export function resolvedEditorMode(preferences: Map<string, 'code' | 'blocks'>, kind: string, syntaxAst: Script | null) {
  return syntaxAst ? preferences.get(kind) || 'code' : 'code';
}
export function refreshEditorSession(
  session: EditorSession,
  source: string,
  context: EditorContext = session.context,
  project: Project | undefined = session.project,
  contextRevision: number = session.contextRevision,
): EditorSession {
  if (contextRevision < session.contextRevision) editorCheckError('古い文脈の更新は反映できません');
  const rebuilt = createEditorSession(
      session.ownerKey,
      source,
      context,
      project,
      contextRevision,
    ),
    changed = source !== session.sourceText,
    invalidated = changed || contextRevision !== session.contextRevision;
  // (blocks are made only of a source that reads)
  if (!changed && session.blockView && rebuilt.blockView) {
    if (!astEquivalent(blockDecode(session.blockView), rebuilt.syntaxAst!))
      editorCheckError('ブロックと本文の世代が一致しません');
    const encoded = editorReidentify(
      { tree: rebuilt.blockView, nodeMap: rebuilt.nodeMap },
      session.blockView,
      rebuilt.syntaxAst!,
    );
    rebuilt.blockView = encoded.tree;
    rebuilt.nodeMap = encoded.nodeMap;
    rebuilt.nodeIds = encoded.nodeIds;
  }
  return {
    ...session,
    ...rebuilt,
    sourceRevision: session.sourceRevision + (changed ? 1 : 0),
    mode: rebuilt.syntaxAst ? session.mode : 'code',
    codeSelection: session.codeSelection,
    blockSelection: changed || !rebuilt.blockView ? null : session.blockSelection,
    scrollState: session.scrollState,
    pendingEdit: invalidated ? null : session.pendingEdit,
    nextBlockId: session.nextBlockId,
  };
}
// A text that names a key: what 「〜」キーがおされている tests, or what is compared with おされたキー. Blocks and
// block-to-code show it by the keyboard's name (F-34: 「スペース」, not 「空白」).
export function keyLiteralAt(index: Map<string, BlockIndexEntry>, id: string): boolean {
  const entry = index.get(id), parent = index.get(entry?.parentId)?.node;
  return entry?.node?.schemaId === 'StringLiteral' && (parent?.schemaId === 'SensorRead:KEY_DOWN' ||
    (/^CompareExpression:/.test(parent?.schemaId || '') && Object.values(parent!.inputs || {}).some(x => (x as BlockTree | undefined)?.schemaId === 'SensorRead:押されたキー')));
}
export function buildBlockIndex(tree: BlockTree): Map<string, BlockIndexEntry> {
  const index = new Map<string, BlockIndexEntry>(),
    seen = new WeakSet<object>();
  const walk: IndexWalk = (
    node: BlockTree | undefined,
    parentId: string | null = null,
    body: string | null = null,
    input: string | null = null,
    position: number | null = null,
    ancestors: string[] = [],
    path: (string | number)[] = [],
  ) => {
    if (!node || typeof node !== 'object' || seen.has(node) || index.has(node.id))
      editorCheckError('循環または重複したブロックです');
    seen.add(node);
    if (typeof node.id !== 'string' || !node.id) editorCheckError('ブロックIDが ありません');
    const schema = BLOCK_SCHEMA_BY_ID.get(node.schemaId);
    if (!schema) editorCheckError('対応していないブロックです');
    // (the walk is given a body and its place, an input and its place in a list, or neither at the root)
    const entry = { node, parentId, body, input, index: position, ancestors, path } as BlockIndexEntry;
    index.set(node.id, entry);
    const lineage = [...ancestors, node.id];
    for (const slot of schema.inputs) {
      const value = node.inputs?.[slot.key];
      if (value === undefined && slot.required === false) continue;
      if (slot.multiple) {
        if (!Array.isArray(value)) editorCheckError('式の 配列が ありません');
        value.forEach((child, i) =>
          walk(child, node.id, null, slot.key, i, lineage, [...path, 'inputs', slot.key, i]),
        );
      // (an input that holds one value holds a block)
      } else walk(value as BlockTree | undefined, node.id, null, slot.key, null, lineage, [...path, 'inputs', slot.key]);
    }
    for (const slot of schema.bodies) {
      const children = node.bodies?.[slot.key];
      if (!Array.isArray(children)) editorCheckError('本文の 配列が ありません');
      children.forEach((child, i) =>
        walk(child, node.id, slot.key, null, i, lineage, [...path, 'bodies', slot.key, i]),
      );
    }
  };
  walk(tree);
  return index;
}
function editorCandidateProject(session: EditorSession, source: string, project: Project | undefined, context: EditorContext, validatedAst: Script | null = null): Project {
  if (!project) editorCheckError('作品の 文脈が ありません');
  const candidate: Project = {
    ...project,
    scripts: project.scripts.map((x) => ({ ...x })),
    actions: project.actions.map((x) => ({ ...x })),
    functions: project.functions.map((x) => ({ ...x })),
  };
  if (session.ownerKind === 'script') {
    const parts = session.ownerKey.split(':'),
      existing = scriptBySourceKey(candidate, session.ownerKey),
      // (a part and an event are found below, or the edit stops)
      targetId = existing?.targetId || context.targetId || (parts.length === 3 ? parts[1] : null) as string,
      event = existing?.event || context.event || (parts.length === 3 ? parts[2] : null) as EventName,
      target = targetId === 'stage' ? { type: 'stage' as const } : project.components.find((x) => x.id === targetId);
    if (!target || !EVENT_BY_TYPE[target.type]?.includes(event))
      editorError('だれが 動くか、いつ 動くかが かわったよ。もう一度 えらんでから やってね。');
    const row: ProjectScript = existing || { ...(parts.length === 2 ? { id: parts[1] } : {}), targetId, event, source: '' };
    // The editor already parsed this exact source and checked its AST. Ordinary
    // bodies retain their metadata; headed, document and changed contexts use
    // the full updater to reconcile their headings and document unit IDs.
    if (validatedAst && !validatedAst.heading && !validatedAst.units && !row.document && !isMeijinScript(row)
      && context.targetId === row.targetId && context.event === row.event && !context.meijin
      && !context.definitionKind && !context.definition && !(context.args || []).length) {
      row.source = source;
      if (row.filter === undefined) delete row.filter;
    } else updateScriptSource(row, source, candidate);
    if (!existing) candidate.scripts.push(row);
  } else {
    const kind = context.definitionKind || session.ownerKind,
      definition = context.definition;
    if (!definition || kind !== session.ownerKind) editorCheckError('定義の 下書き文脈が ありません');
    candidate.actions = candidate.actions.filter((x) => x.id !== definition.id);
    candidate.functions = candidate.functions.filter((x) => x.id !== definition.id);
    // (the draft is the made block of its kind)
    (candidate[kind === 'action' ? 'actions' : 'functions'] as (ActionDefinitionData | FunctionDefinitionData)[]).push({
      ...definition,
      args: context.args || definition.args || [],
      source,
    });
  }
  if (
    candidate.scripts.length > LIMITS.scripts ||
    candidate.actions.length + candidate.functions.length > LIMITS.callables
  )
    editorError('本文と 自分で作ったブロックの 数が、いちばん 大きい 数を こえたよ。いらない ものを けしてね。');
  let total = 0;
  for (const record of [...candidate.scripts, ...candidate.actions, ...candidate.functions]) {
    if (typeof record.source !== 'string' || cpLen(record.source) > LIMITS.sourceEach)
      editorError('1つの 本文の 文字の 数が、いちばん 大きい 数を こえたよ。少し へらしてね。');
    total += cpLen(record.source);
  }
  if (total > LIMITS.sourceTotal) editorError('作品ぜんぶの 本文の 長さが、いちばん 大きい 数を こえたよ。いらない ところを けしてね。');
  return candidate;
}
// (an input with several values holds a list of blocks, one with one value a block; every block has its place)
function editorReidentify(encoded: { tree: BlockTree; nodeMap: Map<string, BlockLocation> }, previousTree: BlockTree, ast: Script): EncodedBlocks {
  const oldIndex = buildBlockIndex(previousTree), fresh = [...buildBlockIndex(encoded.tree).values()];
  const pairs = new Map<string, string>(), occupied = new Set(oldIndex.keys());
  let serial = 1;
  const pair = (before: BlockTree | undefined, after: BlockTree | undefined) => {
    if (!before || !after) editorCheckError('再解析でブロックの対応が変わりました');
    // A numeric command role is printed with its unit. Preserve the number's
    // identity when parsing adds that explicit unit wrapper.
    if (after.schemaId === 'QuantityLiteral' && before.schemaId !== 'QuantityLiteral') {
      pair(before, after.inputs.value as BlockTree); return;
    }
    if (before.schemaId === 'QuantityLiteral' && after.schemaId !== 'QuantityLiteral') {
      pair(before.inputs.value as BlockTree, after); return;
    }
    if (before.schemaId !== after.schemaId) editorCheckError('再解析でブロックの対応が変わりました');
    pairs.set(after.id, before.id);
    // (a block of a tree has its schema)
    const schema = BLOCK_SCHEMA_BY_ID.get(after.schemaId)!;
    for (const slot of schema.inputs) {
      const x = before.inputs[slot.key], y = after.inputs[slot.key];
      if (slot.multiple) {
        if ((x as BlockTree[] | undefined || []).length !== (y as BlockTree[] | undefined || []).length) editorCheckError('再解析で値の数が変わりました');
        (y as BlockTree[] | undefined || []).forEach((child, i) => pair((x as BlockTree[])[i], child));
      } else if (x || y) pair(x as BlockTree | undefined, y as BlockTree | undefined);
    }
    for (const slot of schema.bodies) {
      const x = before.bodies[slot.key], y = after.bodies[slot.key];
      if (x.length !== y.length) editorCheckError('再解析で本文の数が変わりました');
      y.forEach((child, i) => pair(x[i], child));
    }
  };
  const oldNodes = [...oldIndex.values()];
  if (oldNodes.length === fresh.length && oldNodes.every((entry, i) => entry.node.schemaId === fresh[i].node.schemaId))
    fresh.forEach((entry, i) => pairs.set(entry.node.id, oldNodes[i].node.id));
  else pair(previousTree, encoded.tree);
  const nodeMap = new Map<string, BlockLocation>(), nodeIds = new WeakMap<object, string>();
  for (const entry of fresh) {
    const oldId = entry.node.id, location = encoded.nodeMap.get(oldId)!;
    let id = pairs.get(oldId);
    if (!id) { do { id = 'eRole-' + serial++; } while (occupied.has(id)); occupied.add(id); }
    entry.node.id = id; nodeMap.set(id, location);
    let node: unknown = ast; for (const key of location.path) node = (node as { readonly [key: string]: unknown })[key];
    nodeIds.set(node as object, id);
  }
  return { tree: encoded.tree, nodeMap, nodeIds };
}
// The は／が of every written subject, in reading order (は when none is recorded).
// (every object below the script is gone through and read as a node: one that is no node matches no test below)
function subjectParticles(ast: TreeNode) {
  const out: string[] = [], walk = (value: TreeNode | (TreeNode | null)[] | null | undefined) => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== 'object') return;
    if (value.actorRef?.kind === 'named') out.push(value.actorRef.particle || 'は');
    for (const [key, child] of Object.entries(value)) if (key !== 'actorRef' && key !== 'sourceSpan') walk(child as TreeNode);
  };
  walk(ast);
  return out;
}
// The line breaks that end a text written again keep their place. The spaces at the end of its last line stay with that
// line: they may be the end of its memo (「※ 移動先 」), which must not pass to the line written there now.
const closingBreaks = (text: string | null | undefined) => /(?:\r\n?|\n)\s*$/.exec(text || '')?.[0] || '';
// symbols: the work's names, so a reprinted block uses the F-34 forms (点数を言う, 持ち物の数, 色を…にする).
// (the session shows blocks: its source reads)
function preserveBlockSource(session: EditorSession, tree: BlockTree, sourceOrigins: Map<string, string> = new Map<string, string>(), symbols: Symbols | null = null): string {
  const source = session.sourceText, oldIndex = buildBlockIndex(session.blockView!);
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const surface = (node: BlockTree) => session.nodeMap.get(node.id)?.surface;
  const newline = source.includes('\r\n') ? '\r\n' : source.includes('\r') ? '\r' : '\n';
  const inheritedActors = new Map<string, ActorRef>(), originalActors = new Map<string, ActorRef>();
  // (a block of a tree has its schema; who acts is a block's actorRef)
  const rememberTopics = (body: BlockTree[], inherited: ActorRef = {kind:'self'}, topics = inheritedActors) => {
    let topic = inherited;
    for (const node of body) {
      const schema = BLOCK_SCHEMA_BY_ID.get(node.schemaId)!;
      topics.set(node.id, topic);
      for (const slot of schema.bodies) rememberTopics(node.bodies[slot.key], node.fields.actorRef as ActorRef | undefined || {kind:'self'}, topics);
      // A wait of the whole flow (みんな) leaves the topic as it is.
      if (!schema.bodies.length && !['CommentLine','Hole'].includes(schema.kind) &&
        !(node.fields.actorRef ? (node.fields.actorRef as ActorRef).kind === 'all' : EVERYONE_WAITS.has(schema.kind)))
        topic = node.fields.actorRef as ActorRef | undefined || {kind:'self'};
    }
  };
  // (a script and its units have their bodies)
  rememberTopics(tree.bodies.body!);
  // (a script's units are a list of blocks)
  rememberTopics(session.blockView!.bodies.body!, {kind:'self'}, originalActors);
  for(const unit of tree.inputs.units as BlockTree[] | undefined||[])rememberTopics(unit.bodies.body!);
  for(const unit of session.blockView!.inputs.units as BlockTree[] | undefined||[])rememberTopics(unit.bodies.body!,{kind:'self'},originalActors);
  const structuralLines=(text: string)=>normalizeSource(text).lines.filter(line=>!line.continuation).map(line=>line.raw);
  const newIndex = buildBlockIndex(tree);
  // (the block's schema says what kind of node it decodes to)
  const standard = (node: BlockTree) => {
    const schema = BLOCK_SCHEMA_BY_ID.get(node.schemaId)!, ast = blockDecode(node);
    if (schema.category === 'expression') {
      // A said value is written as its sentence writes it, with no （ ） around 持ち物の数 (F-34); a condition keeps them.
      const at = newIndex.get(node.id), bare = newIndex.get(at?.parentId)?.node?.schemaId === 'Say' && at!.input === 'value' && !isConditionValue(ast as Expression);
      return formatExpression(keyLiteralAt(newIndex, node.id) ? { ...ast as StringLiteral, value: keySurface((ast as StringLiteral).value) } : ast as Expression, bare ? 0 : PREC.ATOM, { symbols });
    }
    if (schema.category === 'target') return formatTarget(ast as Target);
    if (schema.category === 'script') return structuralLines(formatScript(ast as Script, { symbols })).join(newline);
    if (schema.category === 'rule') return structuralLines(formatScript({kind:'Script',body:[],rules:[ast as Rule]}, { symbols })).join(newline);
    // Format a replacement in its destination scope, adding self only when needed.
    return structuralLines(formatScript({kind:'Script', body:[ast as Statement]}, {inheritedActor:inheritedActors.get(node.id), symbols})).join(newline);
  };
  // A sentence that reads as block-to-code writes it gets its words written again when a value in it changes, so the
  // value takes its F-34 form and only the （ ） its place needs (かばんの数を言う。, もしかばんの数が0なら、). Its memo and
  // the spaces before the memo stay as written; a sentence in the child's own words is left to the value-only change.
  const rewrittenAsStandard = (before: BlockTree, after: BlockTree) => {
    // (a range is the location's: it is there)
    const location = surface(before), schema = BLOCK_SCHEMA_BY_ID.get(before.schemaId)!,
      range = schema.bodies.length ? location?.range : location?.extent;
    if (!range || location!.inline || location!.inlineContainer) return null;
    // (the first sentence of a text, with every line of a 「 」 in it that goes on over lines)
    const first = (text: string | undefined) => splitComment(structuralLines(String(text || ''))[0]).code.trimEnd(), bare = (text: string) => text.trim().replace(/。$/, '');
    let was: string, now: string;
    try {
      was = first(structuralLines(formatScript({kind:'Script', body:[blockDecode(before) as Statement]}, {inheritedActor:originalActors.get(before.id), symbols}))[0]);
      now = first(standard(after)).trim();
    } catch (_) { return null; }
    // (the pattern takes any text)
    const written = first(source.slice(range.start, range.end)), lead = written.match(/^\s*/)![0];
    if (!written.trim() || bare(written) !== bare(was)) return null;
    if (!written.endsWith('。')) now = now.replace(/。$/, '');
    return now === written.trim() ? [] : [{ start: range.start, end: range.start + written.length, text: lead + now }];
  };
  const sameActorContext = (before: BlockTree | undefined, after: BlockTree) => {
    if (same(originalActors.get(before?.id), inheritedActors.get(after.id))) return true;
    let originalAst: unknown = session.syntaxAst;
    for (const key of session.nodeMap.get(before?.id)?.path || []) originalAst = (originalAst as { readonly [key: string]: unknown } | null | undefined)?.[key];
    return STATEMENT_EXPLICIT_ACTORS.has(originalAst as object);
  };
  const moved = (node: BlockTree, indent: number) => {
    const original = oldIndex.get(sourceOrigins.get(node.id)||node.id)?.node, location = original && surface(original);
    const equal=original&&(original.id===node.id?same(original,node):same(blockDecode(original),blockDecode(node)));
    const reusable = equal && location?.extent && sameActorContext(original,node);
    const text = reusable
      ? source.slice(location.extent.start, location.extent.end) : standard(node);
    const oldIndent = reusable ? location.indent : 0;
    // (each later line keeps how far in from the sentence it is, as a width: a full-width space counts as two; it is
    // written with half-width spaces)
    return structuralLines(text).map((line, i) => {
      if (!i) return line;
      const lead = line.match(/^[ 　]*/u)![0];
      return ' '.repeat(indent + Math.max(0, indentWidth(lead) - oldIndent)) + line.slice(lead.length);
    }).join(newline);
  };
  // An inline sentence before the words of its block (10歩進むことを3回くり返す): its place ends at its words, the 。 and the
  // memo of the line come after the block's words.
  const beforeBlockWords = (location: SourceRanges | undefined) => location?.inline && location.range && location.extent &&
    splitComment(source.slice(location.range.end, location.extent.end)).code.replace(/[\s。]/g, '') !== '';
  const fallback = (before: BlockTree, after: BlockTree): SourceEdit[] | null => {
    const location = surface(before), schema = BLOCK_SCHEMA_BY_ID.get(before.schemaId)!;
    // A changed preceding topic only needs an explicit subject. Keep the
    // original control header (including a legacy ForEach binder) and body.
    if (schema.bodies.length && same(before, after) && location?.range && !sameActorContext(before, after))
      return [{start:location.range.start, end:location.range.start, text:sentenceActorSource(after.fields.actorRef as ActorRef) + 'は、'}];
    if(before.schemaId==='ForEach' && after.schemaId==='ForEach' && before.fields.binder!==after.fields.binder &&
      same({...before.fields,binder:after.fields.binder},after.fields) && same(before.inputs,after.inputs) && same(before.bodies,after.bodies) && same(before.annotations,after.annotations)) {
      const binder=`【${after.fields.binder}】`;
      if(location?.binderRange)return [{...location.binderRange,text:binder}];
      if(location?.binderInsert){const {at,indent}=location.binderInsert;return [{start:at,end:at,text:newline+' '.repeat(indent)+`この中では、今見ているものを${binder}とよぶ。`}];}
    }
    if(location?.inlineContainer && location.extent && before.schemaId===after.schemaId &&
      ['IfStatement','RepeatCount','Forever','RepeatWhile','RepeatUntil'].includes(after.schemaId) && same(before.fields,after.fields) && same(before.annotations,after.annotations)) {
      const bodyKey=after.schemaId==='IfStatement'?'thenBody':'body',indent=location.indent+2;
      // (a もし and a repeat have their bodies)
      if(before.bodies[bodyKey]!.length===1 && !after.fields.hasElse){
        const rows=[standard(after).split(/\r\n?|\n/)[0]];
        for(const child of after.bodies[bodyKey]!){
          const original=oldIndex.get(sourceOrigins.get(child.id)||child.id)?.node,at=original&&surface(original);
          // (beforeBlockWords: the sentence has its place and its range)
          let text=beforeBlockWords(at)&&!at!.rewritten&&same(original,child)&&sameActorContext(original,child)
            ? source.slice(at!.range!.start,at!.range!.end)+'。'+(child.annotations?.inlineComment?'  '+child.annotations.inlineComment:'') : moved(child,indent);
          if(!/[\r\n]/.test(text)){const parts=splitComment(text);text=parts.code.trimEnd()+(parts.comment?'  '+parts.comment:'');}
          rows.push(' '.repeat(indent)+text);
        }
        return [{...location.extent,text:rows.join(newline)}];
      }
    }
    if (schema.category==='statement' && schema.bodies.length && before.schemaId === after.schemaId && !location?.inlineContainer &&
      location?.range && same(before.bodies, after.bodies) && same(before.annotations, after.annotations) &&
      same(before.fields.actorRef, after.fields.actorRef)) {
      const header = splitComment(standard(after).split(/\r\n?|\n/)[0]).code.trimEnd().replace(/。$/, '');
      // A header written again ends with 、 (its sentences are on the lines below): the 。 after what it replaces (as after
      // 、次のことをする, one or more), and the spaces before each, go with it.
      const stop = header.endsWith('、') ? /^(?:[ \t\u3000]*。)+/.exec(source.slice(location.range.end)) : null;
      return [{...location.range, end: location.range.end + (stop ? stop[0].length : 0), text:header}];
    }
    // A rule is a whole line like a statement: its range ends before 。 but its text ends with it.
    const lineSchema = ['statement','rule'].includes(schema.category);
    const range = lineSchema ? location?.extent : location?.range;
    if (!range) return null;
    if(schema.category==='script')return [{...range,text:standard(after)+closingBreaks(source.slice(range.start,range.end))}];
    // (the range is the location's: it is there, and a sentence's has its indent)
    if (location!.inline && (beforeBlockWords(location) || BLOCK_SCHEMA_BY_ID.get(after.schemaId)?.bodies.length || /[\r\n]/.test(standard(after)))) return null;
    return [{...range, text:lineSchema ? moved(after, location!.indent!) : location?.conditionForm ? formatCondition(blockDecode(after) as Expression,location.conditionForm) : standard(after)}];
  };
  const bodyChanges = (before: BlockTree[], after: BlockTree[], owner: BlockTree, key: string): SourceEdit[] | null => {
    const location = surface(owner);
    let first = 0, last = before.length, end = after.length;
    const changes: SourceEdit[] = [];
    while (first < last && first < end && before[first].id === after[first].id) {
      const edits = plan(before[first], after[first]);
      if (!edits) return null;
      changes.push(...edits); first++;
    }
    while (last > first && end > first && before[last - 1].id === after[end - 1].id) {
      const edits = plan(before[--last], after[--end]);
      if (!edits) return null;
      changes.push(...edits);
    }
    if (first === last && first === end) return changes;
    if (location?.inlineContainer) return null;
    // (where the line of a sentence starts, and whether the sentence is the first one written on it)
    const lineStart = (at: number) => at > 0 ? Math.max(source.lastIndexOf('\n', at - 1), source.lastIndexOf('\r', at - 1)) + 1 : 0;
    const startsLine = (node: BlockTree | undefined) => { const at = node && surface(node)?.extent?.start; return at !== undefined && !source.slice(lineStart(at), at).trim(); };
    const lineOf = (node: BlockTree | undefined) => { const at = node && surface(node)?.extent?.start; return at === undefined ? -1 : lineStart(at); };
    // Sentences put between two sentences that share a line: that line is written again, one sentence on each line, and
    // the other lines stay as they are written.
    let shared: Set<string> | null = null;
    // Sentences taken from a line that holds several: that line is written again in the same way, also when the change
    // goes on over other lines (each line of several it touches is written again; a line of one sentence keeps its words).
    const several = (n: BlockTree) => lineOf(n) >= 0 && before.filter(m => lineOf(m) === lineOf(n)).length > 1, taken = first < last && before.slice(first, last).some(several);
    if (taken || (first === last && first > 0 && last < before.length && surface(before[last])?.inline && !startsLine(before[last]) && lineOf(before[first - 1]) === lineOf(before[last]))) {
      const top = lineOf(before[first < last ? first : last]), bottom = lineOf(before[first < last ? last - 1 : last]);
      while (first > 0 && lineOf(before[first - 1]) === top) first--;
      while (last < before.length && lineOf(before[last]) === bottom) { last++; end++; }
      shared = new Set(before.slice(first, last).filter(several).map(n => n.id));
    }
    const old = before.slice(first, last), fresh = after.slice(first, end);
    if (old.some(n => !surface(n)?.extent || (surface(n)?.inline && !shared?.has(n.id)))) return null;
    const next = before[last], previous = before[first - 1];
    // (each block taken has its place, and a sentence's has its extent: checked above)
    let start: number, finish: number, indent: number;
    if (old.length) {
      const a = surface(old[0]) as SentenceRanges, b = surface(old[old.length - 1]) as SentenceRanges;
      // (a sentence that starts its line starts after the indent: the line starts where the row does, as the indent's
      // width, where a full-width space counts as two, is no count of characters)
      start = lineStart(a.extent.start);
      finish = b.extent.end;
      indent = shared ? indentWidth(source.slice(start, a.extent.start)) : a.indent;
      const separator = /^(?:\r\n?|\n)/.exec(source.slice(finish));
      if (separator) finish += separator[0].length;
    } else if (next && surface(next)?.extent && (!surface(next)!.inline || startsLine(next))) {
      const a = surface(next) as SentenceRanges; start = finish = lineStart(a.extent.start); indent = indentWidth(source.slice(start, a.extent.start));
    // (after the last sentence of a body the new ones start their own line, also when that sentence shares its line)
    } else if (previous && surface(previous)?.extent && (!next || !surface(previous)!.inline)) {
      // (the last block of a text runs to the text's end: the new ones go before the line breaks that close it)
      const a = surface(previous) as SentenceRanges, closing = /[\r\n]*$/.exec(source.slice(a.extent.start, a.extent.end));
      start = finish = a.extent.end - (closing ? closing[0].length : 0); indent = a.indent;
      const text = fresh.map(n => ' '.repeat(indent) + moved(n, indent)).join(newline);
      changes.push({start, end:finish, text:newline + text});
      return changes;
    } else if (owner.schemaId === 'Script') {
      // (a text with words but no sentence of this body, such as a rule alone: the new ones go on their own line, before
      // the line breaks that close the text)
      // (under a heading the body's sentences are written one step in)
      start = finish = source.length - (/[\r\n]*$/.exec(source)?.[0].length || 0); indent = owner.fields.heading ? 2 : 0;
      if (start > 0 && fresh.length) {
        changes.push({start, end:finish, text:newline + fresh.map(n => ' '.repeat(indent) + moved(n, indent)).join(newline)});
        return changes;
      }
    }
    else return null;
    // (a sentence of the shared line is written as block-to-code writes it, each on its own line)
    const written = (n: BlockTree) => shared?.has(n.id) ? standard(n).split(newline).map((row, i) => i ? ' '.repeat(indent) + row : row).join(newline) : moved(n, indent);
    let text = fresh.map(n => ' '.repeat(indent) + written(n)).join(newline);
    if (fresh.length && (finish < source.length || /[\r\n]$/.test(source.slice(start, finish)))) text += newline;
    if (shared) for (let i = changes.length - 1; i >= 0; i--) if (changes[i].start < finish && changes[i].end > start) changes.splice(i, 1);
    changes.push({start, end:finish, text});
    return changes;
  };
  // (a work's editor has its work; a letter with no place gives NaN, which isInteger refuses)
  const headingPrefixChange = (before: BlockTree,after: BlockTree) => {
    const range=surface(before)?.range;
    if(!range||!before.fields.heading||!after.fields.heading)return null;
    const first=normalizeSource(source.slice(range.start,range.end)).lines.find(line=>line.code),
      heading=first&&readSentenceHeading(first.code,buildSymbols(session.project!),before.fields.heading as Heading);
    if(!heading)return null;
    const begin=first!.mapped.positions[0]!,end=first!.mapped.positions[Math.max(0,heading.body.start-1)]!+1;
    return Number.isInteger(begin)&&Number.isInteger(end)?[{start:range.start+begin,end:range.start+end,text:sentenceHeadingSource(after.fields.heading as Heading)}]:null;
  };
  // (a script's units are a list of blocks)
  const plan = (before: BlockTree, after: BlockTree): SourceEdit[] | null => {
    if(before.schemaId==='Script'&&after.schemaId==='Script'&&(before.inputs.units||after.inputs.units)){
      const first=(node: BlockTree)=>{const inputs={...node.inputs};delete inputs.units;return {...node,inputs};};
      const head=plan(first(before),first(after)),rest=bodyChanges(before.inputs.units as BlockTree[] | undefined||[],after.inputs.units as BlockTree[] | undefined||[],before,'units');
      if(head&&rest){
        const old=[first(before),...(before.inputs.units as BlockTree[] | undefined||[])],next=[first(after),...(after.inputs.units as BlockTree[] | undefined||[])];
        for(let i=1;i<next.length;i++)if(old[i]?.id===next[i].id&&same(old[i],next[i])&&!same(old[i-1].fields.heading,next[i-1].fields.heading)){
          const range=surface(old[i])?.range,raw=range&&source.slice(range.start,range.end),line=raw&&normalizeSource(raw).lines.find(line=>line.code);
          // Resolve an inherited cue explicitly when the previous group changes.
          // The following group keeps its existing trigger and exact body text.
          if(line&&/^(.+?)も同じ合図で動き始め、/.test(line.code)){const edits=headingPrefixChange(old[i],next[i]);if(!edits)return null;rest.push(...edits);}
        }
      }
      return head&&rest?[...head,...rest]:null;
    }
    if (same(before, after)) {
      // (a block of a tree has its schema)
      const schema = BLOCK_SCHEMA_BY_ID.get(after.schemaId)!;
      if (schema.category !== 'statement' || ['CommentLine','Hole'].includes(schema.kind) || sameActorContext(before,after)) return [];
      return fallback(before,after);
    }
    if(before.schemaId==='Script'&&after.schemaId==='Script'&&before.fields.heading&&after.fields.heading&&
      same(before.bodies,after.bodies)&&same(before.inputs,after.inputs)&&same(before.annotations,after.annotations)){
      const edits=headingPrefixChange(before,after);if(edits)return edits;
    }
    if (before.schemaId !== after.schemaId || !same(before.fields, after.fields) || !same(before.annotations, after.annotations))
      return fallback(before, after);
    // The touch test writes the stage edge as 画面のはし (and its sides as 画面の下のはし …), so a change to or from an edge
    // rewrites the whole test.
    if (before.schemaId === 'SensorRead:TOUCHING' && !same(before.inputs.arg, after.inputs.arg) &&
      // (a touch test's partner is one block)
      [before.inputs.arg, after.inputs.arg].some(n => (n as BlockTree | undefined)?.schemaId === 'StringLiteral' && isEdgeTarget((n as BlockTree).fields.value)))
      return fallback(before, after);
    const schema = BLOCK_SCHEMA_BY_ID.get(before.schemaId)!, changes: SourceEdit[] = [];
    // A value changed in a sentence written as block-to-code writes it: the sentence's words are written again.
    if (schema.category === 'statement' && same(before.bodies, after.bodies) && !same(before.inputs, after.inputs)) {
      const whole = rewrittenAsStandard(before, after);
      if (whole) return whole;
    }
    for (const slot of schema.inputs) {
      if (slot.required === false) {
        const had = Object.hasOwn(before.inputs, slot.key), has = Object.hasOwn(after.inputs, slot.key);
        if (!had && !has) continue;
        if (had !== has) return fallback(before, after);
      }
      // (an input with several values holds a list of blocks, one with one value a block)
      const a = slot.multiple ? before.inputs[slot.key] as BlockTree[] : [before.inputs[slot.key] as BlockTree],
        b = slot.multiple ? after.inputs[slot.key] as BlockTree[] : [after.inputs[slot.key] as BlockTree];
      if (a.length !== b.length) return fallback(before, after);
      for (let i = 0; i < a.length; i++) {
        const edits = plan(a[i], b[i]);
        if (!edits) return fallback(before, after);
        changes.push(...edits);
      }
    }
    if(before.schemaId==='Say' && !same(before.inputs.value,after.inputs.value)) {
      // 点数を言う (F-34) for a name the work knows; の値 is added only where a bare name would not read back.
      // (a said value is one value block)
      const value=blockDecode(after.inputs.value) as Expression,needsNoun=value.kind==='VariableRead'&&!(value.qualifier!=='exact'&&symbols?.allDataNames?.has?.(value.name)),
        changesQuote=(before.inputs.value as BlockTree).schemaId==='StringLiteral'&&value.kind!=='StringLiteral';
      if(needsNoun||changesQuote){
        const range=surface(before.inputs.value as BlockTree)?.range,
          tail=range&&/^(\s*)(の\s*値\s*)?([をと])(?=\s*(?:言う|いう|話す|はなす))/.exec(source.slice(range.end));
        if(!tail)return fallback(before,after);
        if(needsNoun&&!tail[2])changes.push({start:range.end,end:range.end,text:'の値'});
        if(tail[3]==='と'){const at=range.end+tail[1].length+(tail[2]?.length||0);changes.push({start:at,end:at+1,text:'を'});}
      }
    }
    for (const slot of schema.bodies) {
      const edits = bodyChanges(before.bodies[slot.key], after.bodies[slot.key], before, slot.key);
      if (!edits) return fallback(before, after);
      changes.push(...edits);
    }
    return changes;
  };
  const changes = plan(session.blockView!, tree);
  if (!changes) return reprintChangedUnits(session,tree,symbols);
  changes.sort((a,b) => b.start - a.start || b.end - a.end);
  let result = source, boundary = source.length;
  for (const change of changes) {
    if (change.start < 0 || change.end > boundary || change.end < change.start)
      editorCheckError('編集範囲が重複しています');
    result = result.slice(0, change.start) + change.text + result.slice(change.end);
    boundary = change.start;
  }
  return result;
}
// (the session shows blocks; a script's units are a list of blocks)
function reprintChangedUnits(session: EditorSession,tree: BlockTree,symbols: Symbols | null=null): string {
  const units=(root: BlockTree)=>{const first={...root,inputs:{...root.inputs}};delete first.inputs.units;return [first,...(root.inputs.units as BlockTree[] | undefined||[])];};
  const before=new Map<string, BlockTree>(units(session.blockView!).map(unit=>[unit.id,unit])),newline=session.sourceText.includes('\r\n')?'\r\n':'\n';
  let source='';
  for(const unit of units(tree)){
    const original=before.get(unit.id),range=original&&session.nodeMap.get(original.id)?.surface?.range,raw=range?session.sourceText.slice(range.start,range.end):null;
    const same=original&&JSON.stringify(original)===JSON.stringify(unit);
    const formatted=same&&raw!==null?raw:normalizeSource(formatScript(blockDecode(unit) as Script,{symbols})).lines.filter(line=>!line.continuation).map(line=>line.raw).join(newline)+closingBreaks(raw);
    if(source&&!/[\r\n]$/.test(source))source+=newline;
    source+=formatted;
  }
  return source;
}
export function prepareBlockEdit(session: EditorSession, operation: BlockOperation, options: BlockEditOptions = {}) {
  const project = options.project || session.project,
    context = editorContext(session.ownerKey, options.context || session.context || {});
  if (options.locked) editorError('動いている ときや じゅんびの とちゅうは、なおせないよ。「■ 止める」を おしてから、もう一度 やってね。');
  for (const key of ['ownerKey', 'sourceRevision', 'contextRevision'] as const)
    if (options[key] !== undefined && options[key] !== session[key])
      editorError('とちゅうで 作品が かわったよ。もう一度 やってね。');
  if (!session.syntaxAst || !session.blockView)
    editorError('先に 書き方の まちがいを 直してね。そうすると ブロックが 使えるよ。');
  if (
    session.pendingEdit && session.pendingEdit.kind !== 'block-draft' &&
    (session.pendingEdit.composing ||
      !session.pendingEdit.id ||
      options.pendingEditId !== session.pendingEdit.id)
  )
    editorError('入れている とちゅうの ものを、Enter キーで 決めるか、Esc キーで やめてね。');
  const unchanged = () => ({
    changed: false,
    source: session.sourceText,
    sourceText: session.sourceText,
    syntaxAst: session.syntaxAst,
    blockView: session.blockView,
    nodeMap: session.nodeMap,
    nodeIds: session.nodeIds,
    diagnostics: session.diagnostics,
    syntaxDiagnostics: session.syntaxDiagnostics,
    ownerKey: session.ownerKey,
    sourceRevision: session.sourceRevision,
    contextRevision: session.contextRevision,
    nextBlockId: session.nextBlockId,
    blockSelection: session.blockSelection,
  });
  if (operation?.type === 'cancel' || operation?.type === 'noop') return unchanged();
  const draftCodec = { allowHoles: true };
  const copyDraftBlock: (node: BlockTree) => BlockTree = (node) => {
    blockDecode(node, draftCodec);
    return JSON.parse(JSON.stringify(node)) as BlockTree;
  };
  // (the tree of a script decodes to a script)
  const original = blockDecode(session.blockView, draftCodec) as Script;
  if (!astEquivalent(original, session.syntaxAst))
    editorCheckError('ブロックと本文の世代が一致しません');
  const tree = copyDraftBlock(session.blockView),
    allocatedIds = new Set(buildBlockIndex(tree).keys()), sourceOrigins=new Map<string, string>();
  let nextId = session.nextBlockId || 1,
    selectedId = session.blockSelection,
    operationCount = 0;
  const lookup: (id: string) => BlockIndexEntry = (id) => {
    const result = buildBlockIndex(tree).get(id);
    if (!result) editorError('その ブロックが 見つからないよ。もう一度 えらんでね。');
    return result;
  };
  const fresh = (node: BlockTree, preserveSource = false) => {
    const copy = copyDraftBlock(node);
    for (const entry of buildBlockIndex(copy).values()) {
      let id: string;
      do {
        id = 'eCore-' + nextId++;
      } while (allocatedIds.has(id));
      if(preserveSource)sourceOrigins.set(id,sourceOrigins.get(entry.node.id)||entry.node.id);
      entry.node.id = id;
      allocatedIds.add(id);
    }
    return copy;
  };
  // (isInteger: the place is a number)
  const position = (value: number | null | undefined, length: number, allowEnd = false): number => {
    if (!Number.isInteger(value) || value! < 0 || value! > (allowEnd ? length : length - 1))
      editorError('そこには 入れられないよ。ほかの ばしょを えらんでね。');
    return value!;
  };
  // (a block of the tree has its schema; an input with several values holds a list of blocks)
  const bodySlot = (parentId: string, key: string) => {
    const parent = lookup(parentId).node,
      schema = BLOCK_SCHEMA_BY_ID.get(parent.schemaId)!,
      slot = schema.bodies.find((x) => x.key === key);
    if (!slot || (slot.when && !parent.fields[slot.when]))
      editorError('そこには ブロックを つなげないよ。ほかの ばしょを えらんでね。');
    return { parent, slot, array: parent.bodies[key] };
  };
  const inputSlot = (parentId: string, key: string, index?: number | null, append = false) => {
    const parent = lookup(parentId).node,
      schema = BLOCK_SCHEMA_BY_ID.get(parent.schemaId)!,
      slot = schema.inputs.find((x) => x.key === key);
    if (!slot) editorError('そこには はめるブロックを 入れられないよ。ほかの ばしょを えらんでね。');
    if (slot.required === false && slot.multiple && !Object.hasOwn(parent.inputs, key)) parent.inputs[key] = [];
    if (slot.multiple) position(index, (parent.inputs[key] as BlockTree[]).length, append);
    else if (index !== undefined && index !== null) editorCheckError('固定入力に番号は指定しません');
    return { parent, slot, array: slot.multiple ? parent.inputs[key] as BlockTree[] : null, index };
  };
  // (an input with several values has its list and the place in it)
  const setInput = (location: ReturnType<typeof inputSlot>, node: BlockTree) => {
    const schema = BLOCK_SCHEMA_BY_ID.get(node.schemaId);
    if (schema?.category !== location.slot.type) editorError(PLACE_UNFIT_MESSAGE);
    if (location.slot.multiple) location.array![location.index!] = node;
    else location.parent.inputs[location.slot.key] = node;
  };
  // A body that shows only its hole (〔くり返すことを えらぶ〕) takes the first block put into it in the hole's place.
  const loneHole: (array: BlockTree[]) => boolean = (array) => array.length === 1 && array[0].schemaId === 'Hole:statement';
  // A body that needs a block and lost its last one shows its hole again, as after 「けす」.
  const refillRequired = (parentId: string, key: string) => {
    const parent = lookup(parentId).node, slot = BLOCK_SCHEMA_BY_ID.get(parent.schemaId)?.bodies.find(s => s.key === key);
    if (!slot?.requiredExecutable || parent.bodies[key].length) return;
    const hole = fresh(createBlock('Hole:statement', { allowHoles: true })); hole.fields.label = slot.label;
    parent.bodies[key].push(hole);
  };
  // (a block in a body has its place there; one in an input, its input)
  const replaceEntry = (entry: BlockIndexEntry, node: BlockTree) => {
    if (!entry.parentId) editorCheckError('本文全体はこの操作では置換できません');
    if (entry.body) {
      if (BLOCK_SCHEMA_BY_ID.get(node.schemaId)?.category !== 'statement')
        editorError('ここには つなぐブロックを 入れてね。はめるブロックは ここには 入れられないよ。');
      lookup(entry.parentId).node.bodies[entry.body][entry.index] = node;
    } else setInput(inputSlot(entry.parentId, entry.input!, entry.index), node);
  };
  // (a block in a body has its parent and its place there; a field or an annotation is set as given, and the tree is
  // checked when it is decoded)
  const apply: (op: BlockOperation) => void = (op) => {
    if (!op || typeof op !== 'object' || ++operationCount > LIMITS.sourceEach)
      editorCheckError('編集操作が不正です');
    if (op.type === 'batch') {
      if (!Array.isArray(op.operations)) editorCheckError('操作の 配列が ありません');
      for (const child of op.operations) apply(child);
      return;
    }
    if (op.type === 'cancel' || op.type === 'noop') return;
    if (op.type === 'field' || op.type === 'annotation') {
      const entry = lookup(op.id),
        schema = BLOCK_SCHEMA_BY_ID.get(entry.node.schemaId)!,
        group = op.type === 'field' ? 'fields' : 'annotations';
      const slot = schema[group].find((x) => x.key === op.key);
      if (!slot) editorCheckError('編集する 欄が ありません');
      if (slot.when && !entry.node.fields[slot.when])
        editorError((MEMO_LINE_WORDS[slot.when] || 'その 行') + 'が ないので、' + slot.label + 'は 書けないよ。');
      // The waited-for broadcast is the one just before (LANGUAGE.md 439); a typed name cannot rebind it.
      if (op.type === 'field' && op.key === 'broadcastRef' && op.value !== entry.node.fields.broadcastRef)
        editorError('待つ合図は、すぐ前の行で送った合図に 決まって います。名前を かえて ほかの合図を えらぶ ことは できません。');
      (entry.node[group] as Record<string, unknown>)[op.key] = op.value;
      selectedId = op.id;
      return;
    }
    if (op.type === 'else') {
      const node = lookup(op.id).node;
      if (node.schemaId !== 'IfStatement' || typeof op.enabled !== 'boolean')
        editorCheckError('「そうでなければ」の 操作が 不正です');
      if (node.fields.hasElse === op.enabled) return;
      node.fields.hasElse = op.enabled;
      node.bodies.elseBody = op.enabled ? [fresh(options.draft === true
        ? createBlock('Hole:statement', { allowHoles: true }) : createBlock('NoOperation'))] : [];
      node.annotations.elseComment = '';
      selectedId = op.id;
      return;
    }
    if (op.type === 'comment-lines') {
      const entry = lookup(op.id);
      if (
        entry.node.schemaId !== 'CommentLine' ||
        !entry.body ||
        !Array.isArray(op.lines) ||
        op.lines.some((x) => typeof x !== 'string' || /[\r\n]/.test(x))
      )
        editorCheckError('コメント行の内容が不正です');
      const array = lookup(entry.parentId!).node.bodies[entry.body],
        nodes = op.lines.map((text) => {
          const node = fresh(createBlock('CommentLine'));
          node.fields.text = text;
          return node;
        });
      array.splice(entry.index!, 1, ...nodes);
      selectedId = nodes[0]?.id || entry.parentId;
      return;
    }
    if (op.type === 'insert' || op.type === 'duplicate') {
      const destination = bodySlot(op.parentId, op.body),
        at = position(op.index, destination.array.length, true),
        node = fresh(op.type === 'duplicate' ? lookup(op.id).node : op.node, op.type === 'duplicate');
      if (BLOCK_SCHEMA_BY_ID.get(node.schemaId)?.category !== 'statement')
        editorError('ここには つなぐブロックを 入れてね。はめるブロックは ここには 入れられないよ。');
      // A visible body placeholder is replaced by the command the child chooses (inserted, copied or moved there).
      // Complete existing bodies still use ordinary insertion semantics.
      if (loneHole(destination.array)) destination.array.splice(0, 1, node);
      else destination.array.splice(at, 0, node);
      selectedId = node.id;
      return;
    }
    // An enclosure put above blocks takes the blocks below it into its first body (E-03): a new one (node) or a
    // moved one whose first body holds no block yet (id). Below the last block it stays empty, showing its hole.
    if (op.type === 'wrap') {
      const destination = bodySlot(op.parentId, op.body);
      let at = position(op.index, destination.array.length, true), node: BlockTree, source: BlockTree[] | null = null, from: BlockIndexEntry | null = null;
      if (op.id) {
        const entry = lookup(op.id), target = lookup(op.parentId);
        if (!entry.body) editorError('この ブロックは ここから もって いけないよ。');
        if (target.node.id === op.id || target.ancestors.includes(op.id))
          editorError('ブロックを 自分の 中には もって いけないよ。ほかの ところを えらんでね。');
        source = lookup(entry.parentId!).node.bodies[entry.body]; from = entry;
        node = entry.node;
      // (a block put round others is new when none is moved)
      } else node = fresh(op.node!);
      const inner = BLOCK_SCHEMA_BY_ID.get(node.schemaId)?.bodies?.[0]?.key;
      if (BLOCK_SCHEMA_BY_ID.get(node.schemaId)?.category !== 'statement' || !inner) editorCheckError('囲いでは ありません');
      if (node.bodies[inner].some(n => n.schemaId !== 'Hole:statement'))
        editorError('中に ブロックが ある 囲いは、下の ブロックを 中に 入れられないよ。');
      if (source) {
        if (source === destination.array && from!.index! < at) at--;
        source.splice(from!.index!, 1);
      }
      if (loneHole(destination.array)) destination.array.splice(0, 1, node);
      else {
        const taken = destination.array.splice(at, destination.array.length - at, node);
        if (taken.length) node.bodies[inner] = taken;
      }
      if (source && !source.length) refillRequired(from!.parentId!, from!.body!);
      selectedId = node.id;
      return;
    }
    // A block and the blocks below it in the same body move together (E-06 「ここから下を まとめて もっていく」).
    if (op.type === 'move-run') {
      const entry = lookup(op.id), target = lookup(op.parentId);
      if (!entry.body) editorError('この ブロックは ここから もって いけないよ。');
      const source = lookup(entry.parentId!).node.bodies[entry.body], run = source.slice(entry.index!);
      if (run.some(n => n.id === target.node.id || target.ancestors.includes(n.id)))
        editorError('ブロックを 自分の 中には もって いけないよ。ほかの ところを えらんでね。');
      const destination = bodySlot(op.parentId, op.body);
      const at = position(op.index, destination.array.length, true);
      // Within its own body a run moves up only; anywhere at or below its first block it stays where it is.
      if (source === destination.array && at >= entry.index!) return;
      source.splice(entry.index!, run.length);
      if (loneHole(destination.array)) destination.array.splice(0, 1, ...run);
      else destination.array.splice(at, 0, ...run);
      if (!source.length) refillRequired(entry.parentId!, entry.body);
      selectedId = op.id;
      return;
    }
    if (op.type === 'remove') {
      const entry = lookup(op.id);
      if (!entry.body) editorError('この ブロックは けせないよ。ほかの ブロックと 入れかえてね。ならんで いる ものは「外す」で 外せるよ。');
      const parent=lookup(entry.parentId!).node,array=parent.bodies[entry.body],slot=BLOCK_SCHEMA_BY_ID.get(parent.schemaId)!.bodies.find(s=>s.key===entry.body)!;
      if(slot.requiredExecutable&&!array.some((node,i)=>i!==entry.index&&!['CommentLine','Hole:statement'].includes(node.schemaId))){
        if(!options.draft)editorError(`${slot.label}には ブロックが 1つ いるよ。先に 新しい ブロックを 入れるか、「何もしない」に 入れかえてね`);
        const hole=fresh(createBlock('Hole:statement',{allowHoles:true}));hole.fields.label=slot.label;array.splice(entry.index!,1,hole);selectedId=hole.id;return;
      }
      array.splice(entry.index!, 1);
      selectedId = array[Math.min(entry.index!, array.length - 1)]?.id || entry.parentId;
      return;
    }
    if (op.type === 'replace') {
      const entry = lookup(op.id),
        node = fresh(op.node);
      replaceEntry(entry, node);
      selectedId = node.id;
      return;
    }
    if (op.type === 'move') {
      const entry = lookup(op.id),
        target = lookup(op.parentId);
      if (!entry.body) editorError('この ブロックは ここから もって いけないよ。');
      if (target.node.id === op.id || target.ancestors.includes(op.id))
        editorError('ブロックを 自分の 中には もって いけないよ。ほかの ところを えらんでね。');
      const source = lookup(entry.parentId!).node.bodies[entry.body],
        destination = bodySlot(op.parentId, op.body),
        at = position(op.index, destination.array.length, true);
      let adjusted = at;
      if (source === destination.array && entry.index! < at) adjusted--;
      if (source === destination.array && entry.index === adjusted) return;
      source.splice(entry.index!, 1);
      if (loneHole(destination.array)) destination.array.splice(0, 1, entry.node);
      else destination.array.splice(adjusted, 0, entry.node);
      if (!source.length) refillRequired(entry.parentId!, entry.body);
      selectedId = op.id;
      return;
    }
    if (op.type === 'expression') {
      const location = inputSlot(op.parentId, op.input, op.index),
        node = fresh(op.node);
      setInput(location, node);
      selectedId = node.id;
      return;
    }
    if(op.type==='operator'){
      const node=lookup(op.id).node,before=BLOCK_SCHEMA_BY_ID.get(node.schemaId)!,after=BLOCK_SCHEMA_BY_ID.get(op.schemaId);
      if(!['BinaryExpression','CompareExpression','LogicalExpression'].includes(before.kind)||after?.kind!==before.kind)editorError('同じ なかまの しるしを えらんでね。ちがう ものに かえる ときは、計算を はじめから 入れなおしてね。');
      node.schemaId=after.id;selectedId=node.id;return;
    }
    if(op.type==='optional-input-remove'){
      const location=inputSlot(op.parentId,op.input);
      if(location.slot.required!==false||location.slot.multiple)editorError('ここは 外せないよ。');
      delete location.parent.inputs[op.input];selectedId=op.parentId;return;
    }
    if (op.type === 'expression-move') {
      const entry = lookup(op.id),
        target = lookup(op.parentId);
      if (
        !entry.input ||
        BLOCK_SCHEMA_BY_ID.get(entry.node.schemaId)?.category !== 'expression'
      )
        editorError('この ブロックは ここから もって いけないよ。');
      const destination = inputSlot(op.parentId, op.input, op.index);
      if (target.node.id === op.id || target.ancestors.includes(op.id))
        editorError('ブロックを 自分の 中には もって いけないよ。ほかの ところを えらんでね。');
      if (
        entry.parentId === op.parentId &&
        entry.input === op.input &&
        (entry.index ?? null) === (op.index ?? null)
      )
        return;
      if (!op.replacement) editorCheckError('移動元の 式を 同じ 操作で 置き換えて ください');
      const replacement = fresh(op.replacement);
      replaceEntry(entry, replacement);
      setInput(destination, entry.node);
      selectedId = entry.node.id;
      return;
    }
    // (the three changes of a list's items, as tested; an input with several values has its list)
    if (['variadic-insert', 'variadic-remove', 'variadic-move'].includes(op.type)) {
      const location = inputSlot(op.parentId!, op.input!, op.index, op.type === 'variadic-insert');
      if (!location.slot.multiple || !location.slot.variadic)
        editorCheckError('個数を 編集できる 入力では ありません');
      if (op.type === 'variadic-insert') {
        const node = fresh(op.node);
        if (BLOCK_SCHEMA_BY_ID.get(node.schemaId)?.category !== location.slot.type)
          editorError('そこには 入れられない ものだよ。合う ものを 入れてね。');
        location.array!.splice(op.index, 0, node);
        selectedId = node.id;
      } else if (op.type === 'variadic-remove') {
        location.array!.splice(op.index, 1);
        selectedId = location.parent.id;
      } else {
        const at = position(op.toIndex, location.array!.length, true),
          adjusted = at > op.index! ? at - 1 : at;
        if (adjusted === op.index) return;
        const [node] = location.array!.splice(op.index!, 1);
        location.array!.splice(adjusted, 0, node);
        selectedId = node.id;
      }
      return;
    }
    editorCheckError('対応していない編集操作です');
  };
  apply(operation);
  const candidateAst = blockDecode(tree, draftCodec) as Script;
  // は／が of a subject is written text, not meaning: astEquivalent leaves it out, so a change of it alone is still an edit.
  if (astEquivalent(original, candidateAst) && stableJson(subjectParticles(original)) === stableJson(subjectParticles(candidateAst))) return unchanged();
  const hasHole = [...buildBlockIndex(tree).values()].some(entry =>
    BLOCK_SCHEMA_BY_ID.get(entry.node.schemaId)?.kind === 'Hole');
  if (hasHole) {
    // A draft may hold holes, not a count condition where no text reads one (outside the condition of 〜まで): one put
    // there is refused as outside a draft. One the draft held already stays, so that it can be taken out.
    if (countsOutsideUntil(candidateAst) > countsOutsideUntil(original)) editorError(EVENT_COUNT_PLACE_MESSAGE);
    const draftSource = formatScript(candidateAst, { allowHoles: true, symbols: project ? buildSymbols(project) : null });
    const baseline = session.blockDraft?.baseline || {
      sourceText: session.sourceText, syntaxAst: session.syntaxAst, blockView: session.blockView,
      nodeMap: session.nodeMap, nodeIds: session.nodeIds,
      diagnostics: session.diagnostics, syntaxDiagnostics: session.syntaxDiagnostics,
      nextBlockId: session.nextBlockId, blockSelection: session.blockSelection,
      sourceRevision: session.sourceRevision, contextRevision: session.contextRevision,
    };
    const pending: PendingEdit = { kind: 'block-draft', ownerKey: session.ownerKey,
      sourceRevision: session.sourceRevision, contextRevision: session.contextRevision,
      value: draftSource, reason: 'あいている ところを えらんで、ブロックを 入れてね' };
    return {
      ...unchanged(), changed: true, draftOnly: true, source: draftSource,
      draftSource, syntaxAst: candidateAst, blockView: tree,
      blockSelection: selectedId, nextBlockId: nextId, pendingEdit: pending,
      blockDraft: { baseline, ast: candidateAst, tree, source: draftSource, pending },
    };
  }
  // Block-to-code writes with the work's names (F-34: 点数を言う, 持ち物の数, 色を「赤」にする). Should that text not read
  // back as the blocks, the forms that read back without the names are written instead.
  const symbols=project?buildSymbols(project):null,parseContext={...context,...(symbols?{symbols}:{})};
  let source = session.blockDraft ? formatScript(candidateAst, { symbols }) : preserveBlockSource(session, tree, sourceOrigins, symbols),
    parsed = parseSyntax(source, parseContext);
  if(!session.blockDraft&&(!parsed.ast||!astEquivalent(candidateAst,parsed.ast))){
    source=reprintChangedUnits(session,tree,symbols);parsed=parseSyntax(source,parseContext);
  }
  if(symbols&&(!parsed.ast||!astEquivalent(candidateAst,parsed.ast))){
    source=session.blockDraft?formatScript(candidateAst):reprintChangedUnits(session,tree);parsed=parseSyntax(source,parseContext);
  }
  if (!parsed.ast) unreadError(parsed.syntaxDiagnostics.map((x) => x.message).join('\n'), true);
  if (!astEquivalent(candidateAst, parsed.ast))
    unreadError(placesValue(operation) ? PLACE_UNFIT_MESSAGE : 'このまま なおすと、動きや メモが かわって しまうので、できなかったよ。', false);
  // (an input with several values holds a list of blocks, one with one value a block; every block has its place)
  const reidentifyDraft: (encoded: EncodedBlocks) => EncodedBlocks = (encoded) => {
    const ids = new Map<string, string>();
    const pair = (before: BlockTree | undefined, after: BlockTree | undefined) => {
      if (!before || !after) return;
      // Role units can become explicit QuantityLiteral nodes during parsing.
      // Keep the chosen value's id and assign an id only to the new wrapper.
      if (after.schemaId === 'QuantityLiteral' && before.schemaId !== 'QuantityLiteral') {
        pair(before, after.inputs.value as BlockTree); return;
      }
      if (before.schemaId === 'QuantityLiteral' && after.schemaId !== 'QuantityLiteral') {
        pair(before.inputs.value as BlockTree, after); return;
      }
      if (before.schemaId !== after.schemaId) return;
      ids.set(after.id, before.id);
      const schema = BLOCK_SCHEMA_BY_ID.get(after.schemaId)!;
      for (const slot of schema.inputs) {
        const a = before.inputs[slot.key], b = after.inputs[slot.key];
        if (slot.multiple) (b as BlockTree[] | undefined || []).forEach((child, i) => pair((a as BlockTree[] | undefined)?.[i], child));
        else pair(a as BlockTree | undefined, b as BlockTree | undefined);
      }
      for (const slot of schema.bodies)
        after.bodies[slot.key].forEach((child, i) => pair(before.bodies[slot.key][i], child));
    };
    pair(tree, encoded.tree);
    const nodeMap = new Map<string, BlockLocation>(), nodeIds = new WeakMap<object, string>();
    for (const entry of buildBlockIndex(encoded.tree).values()) {
      const oldId = entry.node.id, location = encoded.nodeMap.get(oldId)!;
      let id = ids.get(oldId);
      if (!id) { do { id = 'eCore-' + nextId++; } while (allocatedIds.has(id)); allocatedIds.add(id); }
      entry.node.id = id; nodeMap.set(id, location);
      let node: unknown = parsed.ast; for (const key of location.path) node = (node as { readonly [key: string]: unknown })[key];
      nodeIds.set(node as object, id);
    }
    return { tree: encoded.tree, nodeMap, nodeIds };
  };
  const candidateProject = editorCandidateProject(session, source, project, context, parsed.ast),
    diagnostics = editorDiagnostics(parsed.ast, candidateProject, context),
    encoded = context.meijin ? { tree: null, nodeMap: new Map<string, BlockLocation>(), nodeIds: new WeakMap<object, string>() }
      : session.blockDraft ? reidentifyDraft(blockEncode(parsed.ast))
      : editorReidentify(blockEncode(parsed.ast), tree, parsed.ast);
  // An empty text put where a name is read names nothing: its line has an S301 it did not have, and no other new mistake
  // (one that a place refuses for, such as a partner to touch on the stage, is told by the check of the place). It is
  // refused, as the check of the place refuses it.
  if (placesValue(operation) && selectedId) {
    const span = encoded.nodeMap.get(selectedId);
    let placed: unknown = span ? parsed.ast : null;
    for (const key of span?.path || []) placed = (placed as { readonly [key: string]: unknown } | null | undefined)?.[key];
    const line = span?.sourceSpan?.startLine,
      onLine = (list: readonly Diagnostic[]) => list.filter((d) => d.where === session.ownerKey && d.line === line).map((d) => d.code + '|' + d.message),
      before = new Set(onLine(session.diagnostics || [])), added = onLine(diagnostics).filter((d) => !before.has(d));
    if ((placed as StringLiteral | null)?.kind === 'StringLiteral' && (placed as StringLiteral).value === '' && added.length && added.every((d) => d.startsWith('S301|')))
      editorError(EMPTY_NAME_MESSAGE);
  }
  const result = {
    changed: true,
    source,
    sourceText: source,
    syntaxAst: parsed.ast,
    blockView: encoded.tree,
    nodeMap: encoded.nodeMap,
    nodeIds: encoded.nodeIds,
    diagnostics,
    syntaxDiagnostics: [],
    ownerKey: session.ownerKey,
    sourceRevision: session.sourceRevision + 1,
    contextRevision: session.contextRevision,
    context,
    project,
    blockSelection: selectedId,
    nextBlockId: nextId,
    pendingEdit: null,
    blockDraft: null,
  };
  if (options.validateCandidate) {
    // (a verdict read: a value that is no object has none of its fields)
    const verdict = options.validateCandidate(result, candidateProject) as { ok?: boolean; message?: string; then?: unknown } | false | null | undefined;
    if (verdict === false || verdict?.ok === false)
      // (false has no words: the default words are said)
      editorError((verdict as { message?: string })?.message || '作品の きまりに 合わないので、できなかったよ。');
    if (verdict && typeof verdict.then === 'function')
      editorCheckError('確定前の検証は同期して行います');
  }
  return result;
}
// (a session's answers, and the hints of a place: the keys tell them apart)
const EDITOR_AVAILABILITY_CACHE = new WeakMap<EditorSession, Map<string, InsertionAvailability | Hint[]>>();
// candidateNode is the block to be put there in place of a new one of the list; sourceId says that it is carried from
// this script, and names the block it stands as there.
export function blockInsertionAvailability(session: EditorSession, schemaId: string, location: InsertLocation, options: BlockEditOptions & { candidateNode?: BlockTree | null; sourceId?: string | null } = {}): InsertionAvailability {
  if (options.candidateNode) return computeBlockInsertionAvailability(session, schemaId, location, options);
  const cacheKey = [
    options.ownerKey ?? session.ownerKey,
    options.sourceRevision ?? session.sourceRevision,
    options.contextRevision ?? session.contextRevision,
    schemaId,
    location.parentId,
    location.body || '',
    location.input || '',
    location.index ?? '',
  ].join('|');
  let cache = EDITOR_AVAILABILITY_CACHE.get(session);
  if (!cache) {
    cache = new Map<string, InsertionAvailability | Hint[]>();
    EDITOR_AVAILABILITY_CACHE.set(session, cache);
  }
  if (cache.has(cacheKey)) return JSON.parse(JSON.stringify(cache.get(cacheKey))) as InsertionAvailability;
  // Undo and redo bring back a text checked before (a new session, the same words): its answers are kept by content.
  const contentKey = availabilityContentKey(session, schemaId, location, options);
  let result = contentKey && EDITOR_AVAILABILITY_BY_CONTENT.get(contentKey);
  if (!result) {
    result = computeBlockInsertionAvailability(session, schemaId, location, options);
    if (contentKey) {
      if (EDITOR_AVAILABILITY_BY_CONTENT.size >= 4000) EDITOR_AVAILABILITY_BY_CONTENT.clear();
      EDITOR_AVAILABILITY_BY_CONTENT.set(contentKey, result);
    }
  }
  cache.set(cacheKey, result);
  return JSON.parse(JSON.stringify(result)) as InsertionAvailability;
}
const EDITOR_AVAILABILITY_BY_CONTENT = new Map<string, InsertionAvailability>();
// A short print of a long text (two 32-bit hashes and the length), so the keys stay small.
function availabilityHash(text: string): string {
  let a = 0x811c9dc5, b = 7;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = (Math.imul(b, 31) + c) | 0; }
  return (a >>> 0).toString(36) + '.' + (b >>> 0).toString(36) + '.' + text.length;
}
// What an insertion check reads of the project: its names, kinds, places, data, its sounds (「…」を鳴らす needs one, and
// says the first one's name), the other bodies (their number and length, which the limits count) and procedures. It is
// read on every check, because the project may change in place (a part's place set in the properties).
// (the stage or a part, with what it holds)
function projectAvailabilityText(project: Project): string {
  const named = (list: readonly { id: string; name: string }[] | undefined) => (list || []).map(x => [x.id, x.name]);
  const owner = (c: { id?: string; name?: string; type?: string; x?: number; y?: number; costumes?: readonly Costume[]; sounds?: readonly Sound[]; backdrops?: readonly Backdrop[]; localData?: DataSet; text?: string }) => [c.id, c.name, c.type, c.x ?? null, c.y ?? null, named(c.costumes), named(c.sounds), named(c.backdrops), c.localData, c.text ?? null];
  return JSON.stringify([owner(project.stage || {}), (project.components || []).map(owner), project.projectData, named(project.sounds),
    (project.actions || []).map(a => [a.id, a.ownerId, a.name, a.args, a.source]), (project.functions || []).map(f => [f.id, f.ownerId, f.name, f.args, f.source]),
    project.extensions ?? null, (project.scripts || []).length, (project.scripts || []).reduce((n, s) => n + String(s.source || '').length, 0)]);
}
function availabilityContentKey(session: EditorSession, schemaId: string, location: InsertLocation, options: BlockEditOptions): string | null {
  const project = options.project || session.project, context = options.context || session.context || {};
  if (!project || typeof project !== 'object' || typeof session.sourceText !== 'string' || typeof context !== 'object') return null;
  // (a draft's blocks are not its text: its answers are not kept by content)
  if (session.blockDraft) return null;
  try {
    return [options.ownerKey ?? session.ownerKey, schemaId, location.parentId, location.body || '', location.input || '', location.index ?? '',
      availabilityHash(session.sourceText), availabilityHash(JSON.stringify(context, (key: string, value: unknown) => (key === 'symbols' ? undefined : value))),
      availabilityHash(projectAvailabilityText(project))].join('|');
  } catch (error) { return null; }
}
export function editorInsertionHints(session: EditorSession, location: InsertLocation, options: BlockEditOptions = {}): Hint[] {
  if (!location.body) return [];
  const context = options.context || session.context,
    project = options.project || session.project,
    // (the session shows blocks; a body's place is a number; a work's editor has its work)
    entries = buildBlockIndex(session.blockView!),
    parent = entries.get(location.parentId),
    children = parent?.node.bodies[location.body];
  if (!children) return [];
  const lines = session.sourceText.split('\n'),
    next = children[location.index!],
    previous = children[location.index! - 1],
    nextLocation = next && session.nodeMap.get(next.id),
    previousLocation = previous && session.nodeMap.get(previous.id),
    parentLocation = session.nodeMap.get(location.parentId);
  const line = nextLocation?.sourceSpan?.startLine
    ? nextLocation.sourceSpan.startLine - 1
    : previousLocation
      ? previousLocation.endLine || previousLocation.sourceSpan?.endLine || lines.length
      : parentLocation?.sourceSpan?.startLine || 0;
  const parentIndent =
      lines[(parentLocation?.sourceSpan?.startLine || 1) - 1]?.match(/^ */)?.[0].length || 0,
    indent = parent!.node.schemaId === 'Script' ? '' : ' '.repeat(parentIndent + 2),
    before = lines.slice(0, line).join('\n') + (line ? '\n' : '') + indent,
    source = before + '\n' + lines.slice(line).join('\n');
  return hintCandidates(project!, context.targetId, {
    source,
    start: before.length,
    end: before.length,
    definitionKind: context.definitionKind,
    args: context.args || context.definition?.args || [],
    event: context.event,
  });
}
export function initialBlockName(base: string, used: ReadonlySet<string>) {
  let candidate = base;
  if (!used.has(candidate)) {
    validateName(candidate);
    return candidate;
  }
  for (let n = 2; ; n++) {
    const suffix = String(n);
    if (cpLen(suffix) > 32) throw new AkariError('F503', '利用できる初期名を作れません');
    const stem = Array.from(base)
      .slice(0, Math.max(0, 32 - cpLen(suffix)))
      .join('');
    candidate = stem + suffix;
    if (used.has(candidate)) continue;
    validateName(candidate);
    return candidate;
  }
}
// What a new block takes from the work: the owner's centre (決めたばしょへ行く), the first other part in the order
// the parts were made (〜のところへ行く) or the mouse when there is none, and the next costume and backdrop after the
// ones shown now (the same one when there is only one), so 「すがたを かえる」 changes what is seen (F-03). A copy is
// made of another character, else of the owner (LANGUAGE.md 395), and a part's words go to the first 文字・ボタン・四角
// or 入力らん part of the work, by its own name, as 書ける ことば writes them (F2-01). The palette preview shows the same.
export function blockCreationDefaults(project: Project | undefined, targetId: string | null | undefined) {
  const parts = project?.components || [], component = parts.find(c => c.id === targetId),
    next = (items: readonly { id: string; name: string }[] | undefined, id: string | undefined) => items?.length ? items[(Math.max(0, items.findIndex(x => x.id === id)) + 1) % items.length].name : undefined;
  return {
    designPosition: component && Number.isFinite(component.x) && Number.isFinite(component.y) ? { x: component.x, y: component.y } : null,
    partTarget: parts.find(c => c.id !== targetId)?.name || 'マウス',
    spriteTarget: (parts.find(c => c.id !== targetId && c.type === 'sprite') || (component?.type === 'sprite' ? component : null))?.name,
    textTarget: parts.find(c => ['label', 'button', 'box'].includes(c.type))?.name,
    inputTarget: parts.find(c => c.type === 'input')?.name,
    costume: next(component?.costumes, component?.costumeId),
    backdrop: next(project?.stage?.backdrops, project?.stage?.backdropId),
  };
}
// A new block from the list comes with values that run and change something, as the 書ける ことば examples have them
// (FCB-05): the other part (or the mouse) to face, a part to copy (the other part, else itself), ペンの太さ 3, 音の大きさ
// 50％, 1つ, 1段階 and 向き 45度 (0度 is where a new part already looks). A part's words go to a part of the work that
// has them, whatever it is named: 「文字1」の文字を「こんにちは」にかえる, 「入力らん1」に「こんにちは」を入れる and
// （「入力らん1」の中身） (F2-01). 〜のどれか picks from 1 to 6, as a die does. てじゅんを 行った 回数 counts the first
// てじゅん of the work. A value other than the one of a new block is kept. The block is changed in place.
const CREATION_NUMBERS = new Map<string, number>([['PenCommand:SET_SIZE', 3], ['SoundCommand:SET_VOLUME', 50], ['LooksCommand:FORWARD_LAYERS', 1],
  ['LooksCommand:BACKWARD_LAYERS', 1], ['SoundCommand:PITCH_UP', 1], ['SoundCommand:PITCH_DOWN', 1], ['MotionCommand:SET_DIRECTION', 45]]);
// (a list of values is the args of the block)
export function applyCreationDefaults(node: BlockTree, project: Project | undefined, targetId: string | null | undefined): BlockTree {
  const args = node?.inputs?.args as BlockTree[] | undefined, first = args?.[0], parts = project?.components || [];
  const zero = (value: BlockTree | undefined) => value?.schemaId === 'NumberLiteral' && value.fields.value === 0,
    text = (value: BlockTree, words: string) => Object.assign(value, { schemaId: 'StringLiteral', fields: { value: words } }),
    // The name a new block is given when the editor names no part: the first part of that kind, or one that is not there.
    unnamed = (value: BlockTree | undefined, names: string[]) => zero(value) || (value?.schemaId === 'StringLiteral' && names.includes(value.fields.value) && !parts.some(c => c.name === value.fields.value));
  if (node?.schemaId === 'LooksCommand:SET_TARGET_TEXT' || node?.schemaId === 'LooksCommand:SET_INPUT') {
    const input = node.schemaId === 'LooksCommand:SET_INPUT',
      part = parts.find(c => input ? c.type === 'input' : ['label', 'button', 'box'].includes(c.type))?.name;
    if (part && unnamed(first, input ? ['入力らん', '入力らん1'] : ['文字1'])) text(first!, part);
    if (zero(args?.[1])) text(args![1], 'こんにちは');
    return node;
  }
  if (node?.schemaId === 'SensorRead:INPUT_VALUE') {
    const part = parts.find(c => c.type === 'input')?.name;
    if (part && unnamed(node.inputs?.arg as BlockTree | undefined, ['入力らん1'])) text(node.inputs.arg as BlockTree, part);
    return node;
  }
  if (node?.schemaId === 'EventCount:action') {
    const made = project?.actions || [];
    if (made.length && !made.some(a => a.name === node.fields.name)) node.fields.name = made[0].name;
    return node;
  }
  if (node?.schemaId === 'BuiltinCall:乱数' && args?.length === 2 && args.every(zero)) {
    args[0].fields.value = 1; args[1].fields.value = 6;
    return node;
  }
  const other = parts.find(c => c.id !== targetId)?.name,
    character = (parts.find(c => c.id !== targetId && c.type === 'sprite') || parts.find(c => c.id === targetId && c.type === 'sprite'))?.name;
  // A copy given the first other part, a button or a label, is a copy of a character instead.
  // (zero: the first value is a number block)
  if (node?.schemaId === 'CloneCommand:CREATE_TARGET' && character && first?.schemaId === 'StringLiteral'
    && parts.some(c => c.name === first.fields.value && c.type !== 'sprite')) text(first, character);
  if (!zero(first)) return node;
  // Only a character (not a button or a label) has copies.
  const name = node.schemaId === 'MotionCommand:POINT_TO' ? other || 'マウス' : node.schemaId === 'CloneCommand:CREATE_TARGET' ? character : null;
  if (name) text(first!, name);
  else if (CREATION_NUMBERS.has(node.schemaId)) first!.fields.value = CREATION_NUMBERS.get(node.schemaId);
  return node;
}
// The names that can be read at a place, the nearest first, as 書ける ことば gives them for the sentence the place is in
// (a rule's place is in no sentence: the names of the top of the body are given). The place after 「ねこ」の reads what
// that part has of its own.
function readableNames(session: EditorSession, tree: BlockTree, location: InsertLocation, options: BlockEditOptions) {
  const index = buildBlockIndex(tree), chosen = index.get(location.parentId)?.node,
    // (the chosen part of えらんだ キャラクターの 中身 is an actor)
    actor = chosen?.schemaId === 'ActorQualifiedRead' ? chosen.fields.actorRef as ActorRef | undefined : undefined,
    part = actor?.kind === 'named' ? (options.project || session.project)?.components.find(c => c.name === actor.name) : undefined;
  if (part) return { of: part.name, names: [...part.localData.variables.map(a => ({ name: a.name, qualifier: null, kind: 'scalar' })),
    ...part.localData.lists.map(a => ({ name: a.name, qualifier: null, kind: 'list' }))] };
  let place: InsertLocation | null = location.body ? location : null;
  for (let entry = index.get(location.parentId); !place && entry?.parentId; entry = index.get(entry.parentId))
    if (entry.body) place = { parentId: entry.parentId, body: entry.body, index: entry.index };
  return { of: null, names: editorInsertionHints(session, place || { parentId: tree.id, body: 'body', index: 0 }, options)
    .flatMap((hint) => hint.id.startsWith('read:') && hint.binding && 'qualifier' in hint.binding ? [hint.binding] : []) };
}
// The 名前を読む the list shows: with the name it is put in with (a へんすう, else a リスト, nearest to the place, the top
// of the body when none is chosen), or with no name when there is none to read.
export function readNameSample(session: EditorSession, location: InsertLocation | null | undefined, options: BlockEditOptions = {}): BlockTree {
  const node = createBlock('VariableRead'),
    { names } = session.blockView ? readableNames(session, session.blockView, location || { parentId: session.blockView.id, body: 'body', index: 0 }, options) : { names: [] },
    chosen = names.find(b => b.kind !== 'list') || names.find(b => b.kind === 'list');
  return { ...node, fields: { ...node.fields, name: chosen?.name ?? '', qualifier: chosen?.qualifier ?? null } };
}
// The place of a draft's hole in the body before the draft, where the place rules are asked as outside a draft. A block
// the body had is there as it was. A sentence the draft added is put into that body where the draft put it, when it has
// no hole of its own; when it has one, the outermost sentence in it that holds the place and no hole is put at the end of
// the body. A sentence the body had that holds a new value of the draft and no hole is put in as the draft has it. The
// place is found in it by the same steps; a place in a body is asked in that body. A carried value the body did not have
// is asked as a new one.
// When the sentence of the place itself has a hole, there is no text without the draft and none is given.
function draftPlaceInBody(session: EditorSession, location: InsertLocation, options: BlockEditOptions & { sourceId?: string | null }): { session: EditorSession; location: InsertLocation; sourceId: string | null } | null {
  const before = session.blockDraft?.baseline, known = before?.blockView ? buildBlockIndex(before.blockView) : null;
  if (!before?.blockView || !known || !session.blockView) return null;
  const plain: EditorSession = { ...session, ...before, blockDraft: null, pendingEdit: null },
    sourceId = options.sourceId && known.has(options.sourceId) ? options.sourceId : null;
  const index = buildBlockIndex(session.blockView);
  if (known.has(location.parentId)) {
    if (!location.body) return { session: plain, location, sourceId };
    // (a place in a body the body had: its number counts the sentences of that body before it, not the ones the draft
    // added there)
    const at = (index.get(location.parentId)?.node.bodies[location.body] || []).slice(0, location.index)
      .filter((n) => known.get(n.id)?.parentId === location.parentId && known.get(n.id)?.body === location.body).length;
    return { session: plain, location: { ...location, index: at }, sourceId };
  }
  const holed = (node: BlockTree) => [...buildBlockIndex(node).values()].some((x) => BLOCK_SCHEMA_BY_ID.get(x.node.schemaId)?.kind === 'Hole');
  // the chain from the place up to the new sentence put in a body the baseline has
  const chain: BlockIndexEntry[] = [];
  let entry = index.get(location.parentId);
  while (entry && entry.parentId && !(entry.body && known.has(entry.parentId))) { chain.unshift(entry); entry = index.get(entry.parentId); }
  if (!entry || !entry.parentId || !entry.body) return null;
  chain.unshift(entry);
  // the sentence put in: the new one where the draft put it, else the outermost sentence without a hole that holds the place
  let at = 0;
  while (at < chain.length && (BLOCK_SCHEMA_BY_ID.get(chain[at].node.schemaId)?.category !== 'statement' || holed(chain[at].node))) at++;
  if (at >= chain.length) return null;
  const put = chain[at], whole = at === 0, parentId = whole ? put.parentId || '' : before.blockView.id, body = whole ? put.body || 'body' : 'body',
    slot = (known.get(parentId)?.node.bodies[body] || []), steps = chain.slice(at + 1);
  let added: ReturnType<typeof prepareBlockEdit>;
  try {
    added = prepareBlockEdit(plain, whole && known.has(put.node.id) ? { type: 'replace', id: put.node.id, node: put.node }
      : { type: 'insert', parentId, body, index: whole ? Math.min(put.index ?? slot.length, slot.length) : slot.length, node: put.node }, options);
  } catch (_) { return null; }
  if (!added.blockView || (added as { draftOnly?: boolean }).draftOnly || !added.blockSelection) return null;
  let node: BlockTree | undefined = buildBlockIndex(added.blockView).get(added.blockSelection)?.node;
  for (const step of steps) {
    const held: unknown = step.body ? node?.bodies[step.body]?.[step.index ?? 0] : node?.inputs[step.input || ''];
    node = (Array.isArray(held) ? held[step.index ?? 0] : held) as BlockTree | undefined;
  }
  if (!node) return null;
  return { session: { ...plain, ...added, project: plain.project, context: plain.context } as EditorSession, location: { ...location, parentId: node.id }, sourceId };
}
// The count conditions of a tree that are outside the condition of a 〜まで (S314 reads them only there).
function countsOutsideUntil(value: unknown, inUntil = false): number {
  if (!value || typeof value !== 'object') return 0;
  const node = value as { readonly kind?: unknown; readonly [key: string]: unknown };
  let found = node.kind === 'EventCount' && !inUntil ? 1 : 0;
  for (const [key, child] of Object.entries(node))
    if (key !== 'sourceSpan') found += countsOutsideUntil(child, inUntil || (key === 'condition' && (node.kind === 'WaitUntil' || node.kind === 'RepeatUntil')));
  return found;
}
// Whether a block is a count condition (〜回おされる, 〜回【手順】する) or holds one in its values.
function holdsEventCount(node: BlockTree | undefined): boolean {
  return !!node && (BLOCK_SCHEMA_BY_ID.get(node.schemaId)?.kind === 'EventCount' || Object.values(node.inputs || {}).flat().some(holdsEventCount));
}
// Why a value is not put in a place where its text does not read back. A count condition is told where it is used:
// outside 〜まで as the check of the work says it, inside one where it reads (the last condition before まで always
// does). Another value is told that the place does not fit it, where the words were the reader's.
function unreadPlaceReason(tree: BlockTree, node: BlockTree, location: InsertLocation, error: Error, readerWords: boolean) {
  const index = buildBlockIndex(tree);
  let until = false, key: string | null | undefined = location.input;
  for (let entry = index.get(location.parentId); !until && key && entry; key = entry.input, entry = entry.parentId ? index.get(entry.parentId) : undefined)
    until = key === 'condition' && ['WaitUntil', 'RepeatUntil'].includes(BLOCK_SCHEMA_BY_ID.get(entry.node.schemaId)?.kind || '');
  if (!until && holdsEventCount(node)) return EVENT_COUNT_PLACE_MESSAGE;
  if (until && BLOCK_SCHEMA_BY_ID.get(node.schemaId)?.kind === 'EventCount')
    return '回数の 条件（〜回おされる、〜回【手順】する）は、ここには 入れられません。「〜まで待つ」「〜まで、くり返す」の 条件の いちばん 後ろに 入れます';
  return readerWords ? PLACE_UNFIT_MESSAGE : error.message;
}
// With placeOnly, the list's block of the kind is judged for the place alone, whatever names the work has.
function computeBlockInsertionAvailability(session: EditorSession, schemaId: string, location: InsertLocation, options: BlockEditOptions & { candidateNode?: BlockTree | null; sourceId?: string | null } = {}, placeOnly = false): InsertionAvailability {
  const schema = BLOCK_SCHEMA_BY_ID.get(schemaId);
  if (!schema) return { enabled: false, reason: 'この ブロックは 使えないよ', diagnostics: [] };
  // あいている ところ is what is left where a block was taken out: it is no block to put in.
  if (schema.draftOnly && !options.candidateNode) return { enabled: false, reason: 'この ブロックは 使えないよ', diagnostics: [] };
  // Values on simple command previews remain visible choices. Enclosures, persistent rules and 〜まで待つ start with
  // visible holes, never an implicit true/0/no-op (LANGUAGE.md: a condition stays to be chosen; F2-05).
  const draft = schema.bodies.some(slot => slot.requiredExecutable) || ['ContinuousRule','ReturnStatement','WaitUntil'].includes(schema.kind) || schema.inputs.some(slot => slot.type === 'target');
  const creationContext = options.context || session.context || {},
    creationProject = options.project || session.project,
    { designPosition, partTarget, costume, backdrop } = blockCreationDefaults(creationProject, creationContext.targetId);
  let node = options.candidateNode ? JSON.parse(JSON.stringify(options.candidateNode)) as BlockTree
    : applyCreationDefaults(createBlock(schemaId, { draft, allowHoles: draft, designPosition, partTarget, costume, backdrop }), creationProject, creationContext.targetId);
  // A new block that reads a name of the work is put in with one that is there: 入力らんの 中身 with the first 入力らん and
  // てじゅんを 行った 回数 with the first てじゅん (applyCreationDefaults), 名前を読む with the nearest name that can be read
  // at the place and goes in it (a へんすう, else a リスト: a place asks for one of the two). With none, it is not put in.
  if (!options.candidateNode && creationProject && !placeOnly) {
    if (node.schemaId === 'SensorRead:INPUT_VALUE' && !creationProject.components.some(c => c.type === 'input'))
      return { enabled: false, reason: '入力らんを 先に 作ります', diagnostics: [], node };
    if (schemaId === 'EventCount:action' && !creationProject.actions?.length)
      return { enabled: false, reason: 'てじゅんを 先に 作ります', diagnostics: [], node };
    // A call names one of the work's てじゅん or 答えを もとめる (the list has a block for each): one that names none is not put in.
    if (schemaId === 'UserActionCall' || schemaId === 'UserFunctionCall') {
      const action = schemaId === 'UserActionCall', made = (action ? creationProject.actions : creationProject.functions) || [];
      if (!made.some(d => d.name === node.fields.name))
        return { enabled: false, diagnostics: [], node, reason: made.length
          ? 'その 名前の ' + (action ? 'てじゅん' : '答えを もとめる ブロック') + 'は ないよ。一覧の ブロックを えらんでね'
          : (action ? 'てじゅん' : '答えを もとめる ブロック') + 'を 先に 作ります' };
    }
    if (schemaId === 'VariableRead' && session.blockView) {
      const { of, names } = readableNames(session, session.blockView, location, options),
        named = (b: typeof names[number] | undefined) => b && computeBlockInsertionAvailability(session, schemaId, location, { ...options, candidateNode: { ...node, fields: { ...node.fields, name: b.name, qualifier: b.qualifier } } }),
        first = named(names.find(b => b.kind !== 'list')),
        second = first?.enabled ? undefined : named(names.find(b => b.kind === 'list'));
      return (second?.enabled ? second : first || second) || { enabled: false, reason: (of === null ? '' : `「${of}」の `) + 'へんすうか リストを 先に 作ります', diagnostics: [], node: { ...node, fields: { ...node.fields, name: '' } } };
    }
  }
  // 〜まで待つ comes as a draft, but whether a wait may go here is checked on a filled one: 答えを もとめる has no waits.
  if (schema.kind === 'WaitUntil' && draft && !options.candidateNode) {
    const filled = computeBlockInsertionAvailability(session, schemaId, location, { ...options, candidateNode: createBlock(schemaId, { idPrefix: 'wait-check' }) });
    if (!filled.enabled) return { ...filled, node };
  }
  if (schemaId === 'NumberLiteral' && location?.input) {
    // (the session shows blocks)
    const parent = buildBlockIndex(session.blockView!).get(location.parentId)?.node;
    if (parent?.schemaId === 'ContinuousRule' && ['seconds', 'distance'].includes(location.input))
      node.fields.value = location.input === 'seconds' ? 1 : 20;
  }
  // These are initial names for new blocks, never changes to existing references.
  if (
    !options.candidateNode && (schemaId === 'ForEach' ||
    schemaId === 'LocalVariableDeclaration' ||
    schemaId === 'LocalListDeclaration')
  ) {
    // (a binder's and a local's name is text)
    const used = new Set<string>((options.context || session.context)?.args || []);
    for (const entry of buildBlockIndex(session.blockView!).values()) {
      if (entry.node.schemaId === 'ForEach') used.add(entry.node.fields.binder as string);
      if (['LocalVariableDeclaration', 'LocalListDeclaration'].includes(entry.node.schemaId))
        used.add(entry.node.fields.name as string);
    }
    const key = schemaId === 'ForEach' ? 'binder' : 'name';
    node.fields[key] = initialBlockName(node.fields[key] as string, used);
  }
  try {
    const cache = EDITOR_AVAILABILITY_CACHE.get(session),
      hintKey =
        'hints|' +
        [
          session.sourceRevision,
          session.contextRevision,
          location.parentId,
          location.body,
          location.index,
        ].join('|');
    let hints = cache?.get(hintKey) as Hint[] | undefined;
    if (!hints) {
      hints = editorInsertionHints(session, location, options);
      cache?.set(hintKey, hints);
    }
    const commonHint = hints.find((hint) => hint.id === schemaId);
    if (commonHint && !commonHint.enabled)
      return { enabled: false, reason: commonHint.reason, diagnostics: [], node };
    // (a place in a body has its body; another, its input)
    const operation: BlockOperation = location.body
      ? { type: 'insert', ...location as Extract<InsertLocation, { body: string }>, node }
      : { type: 'expression', ...location as Extract<InsertLocation, { input: string }>, node };
    // A preview does not commit the pending pointer/field transaction. Keep its
    // owner and generations while checking a separate, complete candidate tree.
    const candidate = prepareBlockEdit({ ...session, pendingEdit: null }, operation, {
        ...options,
        locked: false,
      }),
      // (a block editor's result has blocks; an added block is selected)
      entry = buildBlockIndex(candidate.blockView!).get(candidate.blockSelection),
      span = candidate.nodeMap.get(candidate.blockSelection),
      start = span?.sourceSpan?.startLine,
      end = span?.endLine || span?.sourceSpan?.endLine || start;
    if ((candidate as { draftOnly?: boolean }).draftOnly) {
      // A draft's text is not read, so a value put in a hole of a block the body had before the draft is judged as in the
      // body before it: what the place refuses there, it refuses in the draft with the same reason.
      const plain = draftPlaceInBody(session, location, options);
      if (plain) {
        const answer = computeBlockInsertionAvailability(plain.session, schemaId, plain.location, { ...options, sourceId: plain.sourceId }, placeOnly);
        if (!answer.enabled) return { ...answer, node };
      }
      return { enabled: true, reason: '', diagnostics: [], node, draftOnly: true };
    }
    // A value equal to the one its place holds leaves the text as it was: it goes, whatever mistakes the line has.
    if (!candidate.changed && location.input) return { enabled: true, reason: '', diagnostics: [], node };
    const baseline = new Set(
        (session.diagnostics || []).map((d) => [d.code, d.message, d.where].join('|')),
      ),
      hard = new Set(['S304', 'S305', 'S306', 'S307', 'S309', 'S311', 'S312', 'S313', 'S314']);
    let owner = entry;
    while (owner && !candidate.nodeMap.get(owner.node.id)?.sourceSpan && owner.parentId)
      owner = buildBlockIndex(candidate.blockView!).get(owner.parentId);
    const ownerSpan = owner ? candidate.nodeMap.get(owner.node.id) : null,
      line = ownerSpan?.sourceSpan?.startLine,
      onLine = (d: Diagnostic) => d.where === session.ownerKey && (start !== undefined ? d.line >= start && d.line <= end! : d.line === line);
    // The value put in, in what was read: the values that hold it, and it with all it holds. A draft's lines are not the
    // lines its diagnostics were given on, so nothing is looked for there.
    const holds = new Set<unknown>(), within = new Set<unknown>();
    let placed: unknown = location.input && !session.blockDraft && span ? candidate.syntaxAst : null;
    for (const key of span?.path || []) {
      holds.add(placed);
      placed = (placed as { readonly [key: string]: unknown } | null | undefined)?.[key];
    }
    (function gather(value: unknown) {
      if (!value || typeof value !== 'object' || within.has(value)) return;
      within.add(value);
      for (const [key, child] of Object.entries(value)) if (key !== 'sourceSpan') gather(child);
    })(placed);
    // A value goes into a line that stands. A mistake the line already had, given at the sentence or at a value that is
    // not the one put in and does not hold it, is not the value's: a number is refused as a partner to touch, not as the
    // number compared beside a wrong partner, and not as the size of a pen the stage cannot have.
    const stood = new Set(within.size ? (session.diagnostics || []).filter(onLine).map((d) => d.code + '|' + d.message) : []),
      judgedAt = (d: Diagnostic) => DIAGNOSTIC_JUDGED.get(d) || [{ at: null, told: false }],
      // (a count condition in a wrong place is wrong whatever it holds: S314 is not of a value put into it)
      apart = (d: Diagnostic, at: object | null) => at !== null && (!holds.has(at) || d.code === 'S314') && !within.has(at) && stood.has(d.code + '|' + d.message),
      // (a check of the sentence itself, which the line already had, is of no value in it)
      besides = (d: Diagnostic) => judgedAt(d).every((place) => place.at === null ? stood.has(d.code + '|' + d.message) : apart(d, place.at)),
      // A mistake is the value's own where a value in it was read. One a sentence tells of the value in its hole is of
      // that place: a list said as it is brings the mistake to another say.
      // (two same mistakes on a line are one row: the one put in may have one, beside one that stood)
      own = (d: Diagnostic) => location.input
        ? judgedAt(d).every((place) => place.at !== null && ((!place.told && within.has(place.at)) || apart(d, place.at)))
        : onLine(d);
    const diagnostics = candidate.diagnostics.filter(
      (d) => hard.has(d.code) && ((onLine(d) && !besides(d)) || !baseline.has([d.code, d.message, d.where].join('|'))),
    );
    // A block carried from this script keeps the mistakes of its own that its line already had: they stay shown on it,
    // and do not refuse it where the list's own block of its kind goes (おされたキー is refused wherever the list's is).
    if (diagnostics.length && options.sourceId && !session.blockDraft && (within.size || !location.input)) {
      const index = buildBlockIndex(session.blockView!);
      let from = index.get(options.sourceId);
      while (from && !session.nodeMap.get(from.node.id)?.sourceSpan && from.parentId) from = index.get(from.parentId);
      const fromSpan = from ? session.nodeMap.get(from.node.id) : null,
        first = fromSpan?.sourceSpan?.startLine,
        last = from?.node.id === options.sourceId ? fromSpan?.endLine || fromSpan?.sourceSpan?.endLine || first : first;
      const had = new Set((session.diagnostics || [])
        .filter((d) => d.where === session.ownerKey && first !== undefined && d.line >= first && d.line <= last!)
        .map((d) => d.code + '|' + d.message));
      const brought = diagnostics.filter((d) => !(own(d) && d.where === session.ownerKey && had.has(d.code + '|' + d.message)));
      if (brought.length) return { enabled: false, reason: brought.map((d) => d.message).join('\n'), diagnostics: brought, node };
      if (computeBlockInsertionAvailability(session, schemaId, location, { ...options, candidateNode: null, sourceId: null }, true).enabled)
        return { enabled: true, reason: '', diagnostics: [], node };
    }
    return {
      enabled: diagnostics.length === 0,
      reason: diagnostics.map((d) => d.message).join('\n'),
      diagnostics,
      node,
    };
  } catch (error) {
    // (an edit or a check that could not be made throws an error with its code)
    const readerWords = UNREAD_EDITS.get(error as object),
      reason = readerWords !== undefined && location.input && session.blockView
        ? unreadPlaceReason(session.blockView, node, location, error as Error, readerWords) : (error as Error).message;
    return {
      enabled: false,
      reason,
      diagnostics: [{ code: (error as Error & { code?: string }).code || 'E901', message: reason }],
      node,
    };
  }
}

// A view of EditorSession.blockView (createBlockEditorView, 10-block-view.ts). All language edits go through onOperation,
// which answers synchronously; what the view takes and gives is typed in src/types/block-view.d.ts (BlockViewOptions,
// BlockView).

// Presentation-only geometry. These values never enter the project or runtime AST.
export function blockShapePath(width: unknown, height: unknown, kind = 'stack', cavities: { top: number; bottom: number }[] = []): string {
  const w = Math.max(kind === 'stack' || kind === 'hat' ? 72 : 28, Number(width) || 72),
    h = Math.max(28, Number(height) || 28),
    r = 7;
  if (kind === 'boolean')
    return `M 13 0 H ${w - 13} L ${w} ${h / 2} L ${w - 13} ${h} H 13 L 0 ${h / 2} Z`;
  if (kind === 'value')
    return `M 16 0 H ${w - 16} Q ${w} 0 ${w} 16 V ${Math.max(16, h - 16)} Q ${w} ${h} ${w - 16} ${h} H 16 Q 0 ${h} 0 ${h - 16} V 16 Q 0 0 16 0 Z`;
  if (kind === 'hat')
    return `M 0 18 Q 25 -8 66 10 H ${w - r} Q ${w} 10 ${w} 17 V ${h - r} Q ${w} ${h} ${w - r} ${h} H 50 L 44 ${h + 6} H 26 L 20 ${h} H ${r} Q 0 ${h} 0 ${h - r} Z`;
  let path = `M ${r} 0 H 20 L 26 6 H 44 L 50 0 H ${w - r} Q ${w} 0 ${w} ${r}`;
  let bottom = 8;
  for (const c of cavities) {
    const top = Math.max(bottom, Math.min(h - 14, c.top)),
      end = Math.max(top + 4, Math.min(h - 8, c.bottom));
    path += ` V ${top} H 25 Q 18 ${top} 18 ${top + 7} V ${end - 7} Q 18 ${end} 25 ${end} H ${w}`;
    bottom = end;
  }
  return (
    path +
    ` V ${h - r} Q ${w} ${h} ${w - r} ${h} H 50 L 44 ${h + 6} H 26 L 20 ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`
  );
}
// The workspace zoom: 50% to 200% (pinch, Ctrl and the wheel); − and ＋ step through the presets (E-10).
const BLOCK_ZOOM_STEPS = Object.freeze([0.5, 0.75, 1, 1.25, 1.5, 2]);
export function blockZoomCore(value: unknown): number {
  return Math.max(0.5, Math.min(2, Number(value) || 1));
}
// The next preset above (direction 1) or below (−1) the zoom; a zoom between presets goes to the nearer one that way.
export function blockZoomStep(value: unknown, direction: number): number {
  const now = blockZoomCore(value);
  return direction > 0 ? BLOCK_ZOOM_STEPS.find(step => step > now + 1e-9) ?? 2
    : [...BLOCK_ZOOM_STEPS].reverse().find(step => step < now - 1e-9) ?? 0.5;
}
export function blockZoomScroll(scroll: number, anchor: number, oldZoom: unknown, newZoom: unknown): number {
  return Math.max(0, ((scroll + anchor) / blockZoomCore(oldZoom)) * blockZoomCore(newZoom) - anchor);
}
// (it reads only what a schema is: none, from a missing one, is a stack)
export function blockShapeKind(schema: Partial<Pick<BlockSchema, 'category' | 'kind' | 'id'>>): 'stack' | 'boolean' | 'value' {
  if (schema.category !== 'expression') return 'stack';
  const boolean =
    schema.kind === 'BooleanLiteral' ||
    schema.kind === 'CompareExpression' ||
    schema.kind === 'LogicalExpression' ||
    schema.id === 'UnaryExpression:NOT' ||
    schema.id === 'BuiltinCall:CONTAINS' ||
    [
      'SensorRead:KEY_DOWN',
      'SensorRead:TOUCHING',
      'SensorRead:TOUCHING_COLOR',
      'SensorRead:マウスが押されている',
      'SensorRead:クローンである',
    ].includes(schema.id);
  return boolean ? 'boolean' : 'value';
}
export function blockPaletteGroup(schema: BlockSchema): string {
  if (
    [
      'UnaryExpression',
      'BinaryExpression',
      'CompareExpression',
      'LogicalExpression',
      'BuiltinCall',
    ].includes(schema.kind)
  )
    return 'operator';
  if (schema.kind === 'SensorRead' || schema.kind === 'TimerReset') return 'sense';
  if (schema.kind === 'UserFunctionCall' || schema.kind === 'UserActionCall') return 'action';
  return (
    {
      '動き': 'motion',
      '見た目': 'look',
      '言う・たずねる': 'look',
      'もし・くり返し': 'control',
      '待つ': 'control',
      '止める': 'control',
      '合図': 'event',
      'かず・文字': 'data',
      'へんすう・リスト': 'data',
      'リスト': 'data',
      'この中だけの へんすう・リスト': 'data',
      '音': 'sound',
      'ペン': 'pen',
      'コピー': 'clone',
      '返す': 'action',
      メモ: 'comment',
    // (a palette with no group of its own is an operator's)
    }[schema.palette as '動き' | '見た目' | '言う・たずねる' | 'もし・くり返し' | '待つ' | '止める' | '合図' | 'かず・文字' | 'へんすう・リスト' | 'リスト' | 'この中だけの へんすう・リスト' | '音' | 'ペン' | 'コピー' | '返す' | 'メモ'] as string | undefined || 'operator'
  );
}
// Entry workshop: presentation and learning state, independent of file/runtime contracts.
export function normalizeEntryUiLevel(value: unknown): 'entry' | 'advanced' | 'basic' {
  if (value === null || value === 'entry') return 'entry';
  if (value === 'advanced') return 'advanced';
  return 'basic';
}
// The move blocks of はじめて: 決めたばしょへ行く, いまのばしょから動く (its time can be added) and 前へ進む.
export const ENTRY_BLOCK_SCHEMA_IDS = new Set([
  'MotionCommand:GOTO', 'MotionCommand:MOVE_BY', 'MotionCommand:MOVE', 'MotionCommand:TURN_RIGHT', 'MotionCommand:TURN_LEFT',
  'Say', 'WaitTime', 'RepeatCount', 'LooksCommand:SET_COSTUME',
  'LooksCommand:SET_BACKDROP', 'SoundCommand:TONE_WAIT', 'SoundCommand:SAMPLE_WAIT',
]);
// The palette of はじめて shows 話す, 待つ and くり返す first, then the moves, すがた and 音 (F-03).
export const ENTRY_PALETTE_ORDER = Object.freeze([
  'Say', 'WaitTime', 'RepeatCount',
  'MotionCommand:GOTO', 'MotionCommand:MOVE_BY', 'MotionCommand:MOVE', 'MotionCommand:TURN_RIGHT', 'MotionCommand:TURN_LEFT',
  'LooksCommand:SET_COSTUME', 'SoundCommand:TONE_WAIT', 'LooksCommand:SET_BACKDROP', 'SoundCommand:SAMPLE_WAIT',
]);
// かんたん: the three move blocks of はじめて and 〜のところへ行く come first (final call 10), so the first page of
// よく使う shows them; 自分のほかの動きを止める is there too, and いつ動く？ offers ふれたとき (its hat).
export const BASIC_BLOCK_SCHEMA_IDS = new Set([
  'Say', 'MotionCommand:GOTO', 'MotionCommand:MOVE_BY', 'MotionCommand:MOVE', 'MotionCommand:GOTO_PART',
  'RepeatCount', 'WaitTime', 'MotionCommand:TURN_RIGHT', 'MotionCommand:TURN_LEFT', 'IfStatement',
  'LooksCommand:SET_TARGET_TEXT', 'UserActionCall', 'SoundCommand:TONE_WAIT', 'MotionCommand:SET_DIRECTION',
  ...ENTRY_BLOCK_SCHEMA_IDS, 'Forever', 'LooksCommand:SHOW', 'LooksCommand:HIDE',
  'Assignment', 'NumericUpdate:ADD', 'ListReplace',
  'PenCommand:DOWN', 'PenCommand:UP', 'PenCommand:SET_COLOR', 'PenCommand:SET_SIZE', 'StopCommand:OWN_OTHERS',
]);
// かんたん keeps to the mathematics of primary school (F-21): 三角関数・対数・指数・平方根・絶対値・累乗 are blocks of
// くわしく only. A block already in a body is shown at every level.
export const ADVANCED_ONLY_SCHEMA_IDS = new Set([
  'BuiltinCall:絶対値', 'BuiltinCall:平方根', 'BuiltinCall:正弦', 'BuiltinCall:余弦', 'BuiltinCall:正接', 'BuiltinCall:逆正弦',
  'BuiltinCall:逆余弦', 'BuiltinCall:逆正接', 'BuiltinCall:自然対数', 'BuiltinCall:常用対数', 'BuiltinCall:指数', 'BinaryExpression:POW',
]);
const TUTORIAL_FISH_ASSETS=[{"name": "blue", "sha256": "616a39d40c93c47912be5c1559d78ed5555ccc10b270699ade11a45e193d92a3", "base64": "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", "bytes": 9129}, {"name": "orange", "sha256": "22adce1b1d1bb17451a8b1b536912400f25ac30c47659506a9255f66af958354", "base64": "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", "bytes": 9318}];
// Guided projects remain ordinary editable programs. Artwork and named data are
// provided; every reaction and extension below is inserted by the learner.
// The pictures built into the product that a work may hold: the default mascot, だんご of the toolbox and the fish of
// the guided work. A kept history holds them without their bytes (encodeWorkspaceHistory).
let builtinRecords: readonly AssetRecord[] | null = null;
export function builtinAssetRecords(): readonly AssetRecord[] {
  return builtinRecords ??= Object.freeze([defaultMascotAssetRecord(), dangoMascotAssetRecord(), ...tutorialAssetRecords()]);
}
export function tutorialAssetRecords(): AssetRecord[] {
  return TUTORIAL_FISH_ASSETS.map(a=>makeImmutableAssetRecord({id:'asset-practice-fish-'+a.name,kind:'image',mime:'image/png',
    sha256:a.sha256,bytes:decodeBase64(a.base64),meta:{width:180,height:120}}));
}
export function makeTutorialProject(): Project {
  const p=makeEmptyProject();p.name='さかなキャッチ';
  Object.assign(p.components[0],{name:'さかな',x:320,y:197,w:100,h:67,
    costumes:[{id:'costume-blue',name:'青いさかな',kind:'image',assetId:'asset-practice-fish-blue'},
      {id:'costume-orange',name:'オレンジのさかな',kind:'image',assetId:'asset-practice-fish-orange'}],costumeId:'costume-blue'});
  p.stage.backdrops[0]={id:'backdrop-1',name:'海',kind:'color',value:'#e4f4fc'};
  p.projectData.variables=[{id:'practice-score',name:'点数',initialValue:0}];
  p.components.push({id:'practice-board',type:'label',name:'点数ボード',x:320,y:358,w:600,h:45,fg:'#173047',bg:null,fontSize:24,
    visible:true,direction:0,scalePercent:100,text:'さかなを キャッチ！',localData:{variables:[],lists:[]}});
  // The visible guard against fast clicks (F-29): only this fish's earlier movement stops, then the body goes on.
  p.scripts=[{id:'practice-click',targetId:'sprite-1',event:'click',source:'自分のほかの動きを止める。'}];
  return p;
}
export const TUTORIAL_BLOCKS: { readonly [key: string]: { readonly label: string; readonly source: string; readonly hole?: string } | undefined }=Object.freeze({
  speech:{label:'話す',source:'「こんにちは」と1秒話す。'},
  escape:{label:'ちがう ばしょへ にげる',source:'画面の左下のはしから、右へ120歩から540歩のどれか、上へ100歩から230歩のどれかのばしょへ行く。'},
  swim:{label:'ゆっくり 泳ぐ',source:'1秒かけて、画面の左下のはしから、右へ480歩、上へ187歩のばしょへ行く。'},
  randomSwim:{label:'あちこちへ 泳ぐ',source:'0.5秒かけて、画面の左下のはしから、右へ120歩から540歩のどれか、上へ100歩から230歩のどれかのばしょへ行く。'},
  repeat:{label:'くり返す',source:'3回くり返す。\n  0秒待つ。',hole:'body'},
  right:{label:'右へ 泳ぐ',source:'0.3秒かけて、いまのばしょから、右へ60歩動く。'},
  left:{label:'左へ 泳ぐ',source:'0.3秒かけて、いまのばしょから、左へ60歩動く。'},
  small:{label:'小さくする',source:'大きさを70％にする。'},
  point:{label:'点数を 1 ふやす',source:'点数を1ふやす。'},
  score:{label:'点数を 見せる',source:'「点数ボード」の文字を（「つかまえた：」と点数をつなげた文字）にかえる。'},
  finish:{label:'5ひきなら',source:'もし点数が5以上なら、\n  0秒待つ。',hole:'thenBody'},
  bonus:{label:'3ひきなら',source:'もし点数が3と同じなら、\n  0秒待つ。',hole:'thenBody'},
  bonusPoint:{label:'おまけの 点を ふやす',source:'点数を2ふやす。'},
  cheer:{label:'おいわいの ことば',source:'「クリア！」と0.5秒話す。'},
  remaining:{label:'のこりを 見せる',source:'「点数ボード」の文字を（「あと：」と最大（0、10－点数）をつなげた文字）にかえる。'},
  tone:{label:'音を 鳴らす',source:'880Hzの音を0.1秒鳴らす。'},
  lowTone:{label:'ひくい 音',source:'523Hzの音を0.1秒鳴らす。'},
  midTone:{label:'まん中の 音',source:'659Hzの音を0.1秒鳴らす。'},
  highTone:{label:'たかい 音',source:'784Hzの音を0.1秒鳴らす。'},
  costume:{label:'すがたを かえる',source:'次のすがたにかえる。'},
  turn:{label:'くるっと 回る',source:'右に90度回る。'},
  wait:{label:'少し 待つ',source:'0.1秒待つ。'},
});
// (a step names a block of the table)
export function tutorialCandidate(key: string,project: Project,identity=key): BlockTree {
  const spec=TUTORIAL_BLOCKS[key]!,parsed=parseScript(spec.source,buildSymbols(project),{targetId:'sprite-1',event:'click'});
  const node=blockEncode(parsed.body[0]).tree;
  if(spec.hole)node.bodies[spec.hole]=[createBlock('Hole:statement',{allowHoles:true})];
  let serial=0;const rename=(n: BlockTree)=>{n.id='lesson-'+identity+'-'+(++serial);for(const v of [...Object.values(n.inputs||{}),...Object.values(n.bodies||{})].flat())if(v&&typeof v==='object'&&v.schemaId)rename(v);};rename(node);return node;
}
export function tutorialNodeShape(node: unknown): unknown {
  if(Array.isArray(node))return node.map(tutorialNodeShape);if(!node||typeof node!=='object')return node;
  return Object.fromEntries(Object.entries(node).filter(([k])=>!['id','annotations','sourceSpan','surface','sourceRange'].includes(k)).map(([k,v])=>[k,tutorialNodeShape(v)]));
}
// (a step's path leads to a block, or to nothing)
// (a session that shows no blocks has no tree)
function tutorialNodeAt(tree: BlockTree | null | undefined,path: (string | number)[]=[]) {let n: unknown=tree;for(const part of path)n=(n as { readonly [key: string]: unknown } | null | undefined)?.[part];return n as BlockTree | null | undefined;}
export function tutorialField(tree: BlockTree | null | undefined,step: TutorialStepInput) {
  let node=tutorialNodeAt(tree,step.ref||[]);if(node?.schemaId==='QuantityLiteral')node=node.inputs.value as BlockTree;
  return {node,key:step.field||'value'};
}
export function tutorialDestination(tree: BlockTree | null | undefined,step: TutorialStepInput) {
  const parent=tutorialNodeAt(tree,step.parent||[]);if(!parent)return null;
  const body=step.body||'body',items=parent.bodies?.[body];if(!items)return null;
  return {parentId:parent.id,body,index:items.length===1&&items[0].schemaId==='Hole:statement'?0:step.at??items.length};
}
export function tutorialDefine(s: TutorialStepInput): TutorialStep {return Object.freeze({...s,goal:s.message,target:s.id,
  start:'same-practice-work-and-previous-verified-state',allowed:Object.freeze([s.action||(s.block?'insert:'+s.block:'field:'+s.id),'exit','stop']),
  input:s.ref?{type:typeof s.value==='string'?'text':'number',min:s.min??0,max:s.max??1000}:null,
  ime:'composition is retained; only confirmed input can succeed; Escape cancels this field',success:'expected',
  recovery:s.action==='runtime:click'?'retry-current-run':'stay-and-correct',next:'committed content and observed runtime only',
  exit:'stop-runtime-and-release-all-guards; retain work and pending input'});}
// (a step names a block of the table)
const tutorialInsert=(id: string,key: string,at: number,parent: (string | number)[]=[],body='body',message?: string)=>tutorialDefine({id,block:key,at,parent,body,
  message:message||'光る「＋」を おして、「'+TUTORIAL_BLOCKS[key]!.label+'」を 入れよう。'});
const tutorialTry=(tag: string,clicks=2)=>[
  tutorialDefine({id:'run-'+tag,action:'run',message:'「▶ 動かす」を おして みよう。何が かわったかな？'}),
  tutorialDefine({id:'try-'+tag,action:'runtime:click',clicks,message:'さかなを '+clicks+'回 キャッチして、動きを 見てみよう。'}),
  tutorialDefine({id:'stop-'+tag,action:'stop',message:'「■ 止める」を おして、作る 画面に もどろう。'})];
export const TUTORIAL_STEPS=Object.freeze([
  // The click button is named by the fish (F-23), and the first block is explained (F-29).
  tutorialDefine({id:'choose-click',action:'event:click',message:'「「さかな」が おされた とき」を えらぼう。さかなを おすと 動く 作品を 作るよ。いちばん上の ブロックは、前に おした ときの 動きを 止めて、はじめから 動くための ものだよ。'}),
  tutorialInsert('add-speech','speech',1),
  // The child's own words (F-04): any text that is not empty goes on, and the later steps use it. つかまった！ is the example.
  tutorialDefine({id:'speech-text',ref:['bodies','body',1,'inputs','value'],value:'つかまった！',ownWords:true,
    message:'さかなが 言う ことばを 入れて、Enter キーを おしてね。れい：つかまった！',emptyMessage:'ことばを 入れてね'}),
  tutorialInsert('add-escape','escape',2),...tutorialTry('original',3),
  tutorialDefine({id:'choose-course',action:'choice',choice:'course',message:'できた！ どんな 遊びを 足そう？ ここで「ほぞんして おわる」を おしても いいよ。'})]);
export const TUTORIAL_COURSES=Object.freeze([
  {id:'motion',label:'動きを つけよう',description:'泳ぎ方を かえて 遊ぼう。',children:[
    {id:'swim',label:'あちこちへ 泳ぐ',description:'行く ばしょと 速さを かえよう。'},
    {id:'zigzag',label:'いったり きたり',description:'くり返しで 泳がせよう。'},
    {id:'small',label:'小さな さかな',description:'大きさを かえて、つかまえよう。'}]},
  {id:'score',label:'ゲームに しよう',description:'つかまえた 数を 見せよう。',children:[
    {id:'goal',label:'めざせ、5ひき！',description:'決めた 数で、おいわいしよう。'},
    {id:'bonus',label:'おまけの 点',description:'ある 数に なったら、点を ふやそう。'},
    {id:'remaining',label:'あと何びき？',description:'ひき算で、のこりを 見せよう。'}]},
  {id:'show',label:'音や すがたで 遊ぼう',description:'キャッチしたときの 音や すがたを 作ろう。',children:[
    {id:'melody',label:'音を ならべよう',description:'短い メロディーを 作ろう。'},
    {id:'costume',label:'さかなが へんしん',description:'ちがう すがたで 遊ぼう。'},
    {id:'dance',label:'くるくるショー',description:'回る 動きと、待つ 時間を 組もう。'}]},
]);
export function tutorialCourseSteps(course: string,offset: number,tag: string): TutorialStep[] {
  const steps=course==='motion'?[tutorialInsert(tag+'-swim','swim',offset)]:course==='score'?
    [tutorialInsert(tag+'-point','point',offset),tutorialInsert(tag+'-score','score',offset+1)]:[tutorialInsert(tag+'-tone','tone',offset)];
  return [...steps,...tutorialTry(tag),tutorialDefine({id:tag+'-choose',action:'choice',choice:'extension',course,offset,
    message:'ここまで できたね！ つぎは、どれを 作ろう？'})];
}
export function tutorialExtensionSteps(course: string,leaf: string,offset: number,tag: string): TutorialStep[] {
  const root=(i: number)=>['bodies','body',i],steps: TutorialStep[]=[];let ref: (string | number)[] | undefined,value: number | undefined,min=1,max=10;
  if(leaf==='swim'){steps.push(tutorialInsert(tag+'-random','randomSwim',offset));ref=[...root(offset),'inputs','seconds'];value=.5;min=.5;max=2;}
  if(leaf==='zigzag'){
    steps.push(tutorialInsert(tag+'-repeat','repeat',offset),tutorialInsert(tag+'-right','right',0,root(offset)),tutorialInsert(tag+'-left','left',1,root(offset)));
    ref=[...root(offset),'inputs','count'];value=3;min=1;max=5;
  }
  if(leaf==='small'){steps.push(tutorialInsert(tag+'-small','small',offset));ref=[...root(offset),'inputs','args',0];value=70;min=45;max=100;}
  if(leaf==='goal'||leaf==='bonus'){
    steps.push(tutorialInsert(tag+'-if',leaf==='goal'?'finish':'bonus',offset));
    if(leaf==='bonus')steps.push(tutorialInsert(tag+'-bonus','bonusPoint',0,root(offset),'thenBody'),tutorialInsert(tag+'-score','score',1,root(offset),'thenBody'));
    steps.push(tutorialInsert(tag+'-cheer','cheer',leaf==='bonus'?2:0,root(offset),'thenBody'));
    ref=[...root(offset),'inputs','condition','inputs','right'];value=leaf==='goal'?5:3;min=2;max=6;
  }
  if(leaf==='remaining'){steps.push(tutorialInsert(tag+'-remaining','remaining',offset));
    // This path is resolved from the parsed arithmetic expression, not guessed DOM IDs.
    ref=[...root(offset),'inputs','args',1,'inputs','args',1,'inputs','args',1,'inputs','left'];value=10;min=5;max=15;
  }
  if(leaf==='melody'){
    steps.push(tutorialInsert(tag+'-low','lowTone',offset),tutorialInsert(tag+'-wait','wait',offset+1),tutorialInsert(tag+'-mid','midTone',offset+2),tutorialInsert(tag+'-high','highTone',offset+3));
    ref=[...root(offset+2),'inputs','args',0];value=659;min=250;max=1200;
  }
  if(leaf==='costume'){steps.push(tutorialInsert(tag+'-costume','costume',offset),tutorialInsert(tag+'-size','small',offset+1));ref=[...root(offset+1),'inputs','args',0];value=70;min=45;max=100;}
  if(leaf==='dance'){
    steps.push(tutorialInsert(tag+'-repeat','repeat',offset),tutorialInsert(tag+'-turn','turn',0,root(offset)),tutorialInsert(tag+'-wait','wait',1,root(offset)));
    ref=[...root(offset),'inputs','count'];value=3;min=1;max=5;
  }
  const clicks=course==='score'?6:2;
  // (another leaf asks nothing more)
  const question={swim:'泳ぐ 時間を かえよう。数を 大きくすると、ゆっくり 泳ぐよ。',zigzag:'何回 いったり きたり する？ くり返す 回数を かえよう。',small:'どのくらい 小さくする？ 100なら、もとの 大きさだよ。',goal:'何びきで おいわいする？ ゴールの 数を かえよう。',bonus:'何びき目で おまけが もらえる？ その 数を かえよう。',remaining:'全部で 何びき つかまえる？ はじめの 数を かえよう。',melody:'まん中の 音を かえよう。数を 大きくすると、たかい 音に なるよ。',costume:'へんしんしたら、どの 大きさに する？ 100が もとの 大きさだよ。',dance:'何回 くるくる 回る？ くり返す 回数を かえよう。'}[leaf as 'swim' | 'zigzag' | 'small' | 'goal' | 'bonus' | 'remaining' | 'melody' | 'costume' | 'dance'] as string | undefined;
  steps.push(...tutorialTry(tag,clicks),tutorialDefine({id:tag+'-change',ref,value,free:true,min,max,
    integer:leaf!=='swim',message:question+' 光る 数を '+min+'から'+max+'の 中で、いまと ちがう 数に して、Enter キーを おしてね。'}),
    ...tutorialTry(tag+'-remix',clicks),tutorialDefine({id:tag+'-undo',action:'undo',ref,value,
      message:'「もとに もどす」を 1回 おしてね。自分で かえた 数が、もとに もどるよ。'}),
    tutorialDefine({id:tag+'-next',action:'choice',choice:'course',message:'できた！ ほかの 遊びも 足す？「ほぞんして おわる」を おして、自分で 遊んでも いいよ。'}));
  return steps;
}
// A free step takes the child's own number (in its range, not the one shown) and an ownWords step the child's own
// words, any text that is not empty (F-04). The accepted value goes into state.values, and the expected trees and the
// later steps use it; an empty text keeps the step with its emptyMessage.
// (a free step has its range)
export function tutorialFreeValueAccepted(step: TutorialStep,v: unknown): boolean {
  if(step?.input?.type==='text')return typeof v==='string'&&!!v.trim()&&cpLen(v)<=100;
  return typeof v==='number'&&Number.isFinite(v)&&v>=step.min!&&v<=step.max!&&v!==step.value&&!(step.integer&&!Number.isInteger(v));
}
export function tutorialSequence(state: TutorialState | null | undefined): readonly TutorialStep[] {return state?.steps||TUTORIAL_STEPS;}
export function tutorialStep(state: TutorialState | null | undefined): TutorialStep | null | undefined {return state&&!['exited','complete'].includes(state.phase)?tutorialSequence(state)[state.index]:null;}
export function tutorialAllows(state: TutorialState | null | undefined,action: string): boolean{const step=tutorialStep(state);return !step||step.allowed.includes(action);}
export function tutorialAdvance<T extends TutorialState>(state: T,facts: TutorialFacts,epoch: number): T{const step=tutorialStep(state);if(!step||step.action==='choice'||epoch!==state.epoch||facts.confirmedStep!==step.id||!facts.sameWork||facts.pending||facts.failed||!facts.expected)return state;
  const index=state.index+1;return {...state,index,confirmedStep:null,phase:index===tutorialSequence(state).length?'complete':'waiting'};}
// (the guide's work has its click body; a step puts its block in a body that is there)
export function tutorialExpectedTrees(project: Project,steps: readonly TutorialStep[]=TUTORIAL_STEPS,values: { readonly [step: string]: unknown }={}): BlockTree[] {
  let tree=blockEncode(parseScript(project.scripts.find(s=>s.event==='click')!.source,buildSymbols(project),{targetId:'sprite-1',event:'click'})).tree;
  const states=[structuredClone(tree)];
  for(const step of steps){
    if(step.block){const loc=tutorialDestination(tree,step)!,parent=tutorialNodeAt(tree,step.parent||[])!,items=parent.bodies[loc.body],node=tutorialCandidate(step.block,project,step.id);
      if(items.length===1&&items[0].schemaId==='Hole:statement')items.splice(0,1,node);else items.splice(loc.index,0,node);}
    if(step.ref){const role=tutorialField(tree,step);if(!role.node)editorCheckError('案内の入力先が見つかりません: '+step.id);role.node.fields[role.key]=step.free||step.ownWords?(values[step.id]??step.value):step.value;}
    states.push(structuredClone(tree));
  }return states;
}
// End entry workshop pure definitions.
// Kana, katakana and kanji search the same (E-13): every kanji word of the block names, their search words and the
// sentence forms has its reading here. Longer words are read first (回数 before 回), then single kanji. The audit checks
// that no kanji is left in any block's search text once it is read.
const SEARCH_READINGS = Object.freeze(Object.entries({
  'ぱーせんと':'%','一番':'いちばん','(数)層':'つ','(数)こ':'つ','着替':'きがえ','(数)ぱー':'%','着が':'きが',
  '(数)番め':'番目','(数)ばんめ':'番目','(数)つ目':'番目','(数)つめ':'番目','(数)こめ':'番目','(数)個目':'番目','(数)番':'番目','(数)ばい':'倍','伝える':'つたえる',
  '四捨五入':'ししゃごにゅう','自然対数':'しぜんたいすう','常用対数':'じょうようたいすう','何文字目':'なんもじめ',
  '切り上げ':'きりあげ','切り捨て':'きりすて','繰り返す':'くりかえす','繰り返し':'くりかえし','追いかける':'おいかける',
  '分かれ道':'わかれみち','見えなく':'みえなく','出てくる':'でてくる','右回り':'みぎまわり','左回り':'ひだりまわり',
  '非表示':'ひひょうじ','周波数':'しゅうはすう','音楽':'おんがく','文字数':'もじすう','絶対値':'ぜったいち','平方根':'へいほうこん',
  '逆正弦':'ぎゃくせいげん','逆余弦':'ぎゃくよげん','逆正接':'ぎゃくせいせつ','何番目':'なんばんめ','持ち物':'もちもの',
  '見た目':'みため','大きさ':'おおきさ','小さく':'ちいさく','小さい':'ちいさい','大きく':'おおきく','新しい':'あたらしい',
  '近づく':'ちかづく','落ちる':'おちる','消える':'きえる','増やす':'ふやす','減らす':'へらす','見せる':'みせる',
  '調べる':'しらべる','尋ねる':'たずねる','触れる':'ふれる','当たる':'あたる','重なる':'かさなる','重なり':'かさなり',
  '鳴らす':'ならす','止める':'とめる','止まる':'とまる','終わる':'おわる','終わり':'おわり','始める':'はじめる',
  '始まる':'はじまる','続ける':'つづける','続き':'つづき','変える':'かえる','変わる':'かわる','決める':'きめる',
  '決まる':'きまる','入れる':'いれる','入る':'はいる','入っ':'はいっ','出す':'だす','書く':'かく','回る':'まわる','回し':'まわし',
  '回す':'まわす','比べる':'くらべる','数える':'かぞえる','戻る':'もどる',
  '下ろす':'おろす','下げる':'さげる','下がる':'さがる','上げる':'あげる','上がる':'あがる','行う':'おこなう','行った':'おこなった','行く':'いく','答え':'こたえ','後ろ':'うしろ','速さ':'はやさ','長さ':'ながさ',
  '高さ':'たかさ','太さ':'ふとさ','向き':'むき','余り':'あまり','一つ':'ひとつ','同じ':'おなじ','歩く':'あるく',
  '点数':'てんすう','代金':'だいきん','変数':'へんすう','手順':'てじゅん','計算':'けいさん','挿入':'そうにゅう',
  '記録':'きろく','代入':'だいにゅう','時間':'じかん','歩数':'ほすう','方向':'ほうこう','座標':'ざひょう','移動':'いどう',
  '回数':'かいすう','合図':'あいず','中身':'なかみ','名前':'なまえ','表示':'ひょうじ','部品':'ぶひん','文字':'もじ',
  '背景':'はいけい','番号':'ばんごう','衣装':'いしょう','条件':'じょうけん','全部':'ぜんぶ','内容':'ないよう','関数':'かんすう',
  '位置':'いち','場所':'ばしょ','相手':'あいて','回転':'かいてん','角度':'かくど','最後':'さいご','途中':'とちゅう',
  '番目':'ばんめ','要素':'ようそ','削除':'さくじょ','何度':'なんど','発言':'はつげん','質問':'しつもん','返事':'へんじ',
  '自分':'じぶん','動作':'どうさ','実行':'じっこう','最初':'さいしょ','作品':'さくひん','全体':'ぜんたい','画面':'がめん',
  '手前':'てまえ','入力':'にゅうりょく','音量':'おんりょう','音程':'おんてい','段階':'だんかい','反対':'はんたい',
  '乱数':'らんすう','正弦':'せいげん','余弦':'よげん','正接':'せいせつ','指数':'しすう','最小':'さいしょう','最大':'さいだい',
  '以前':'いぜん','空白':'くうはく','空色':'そらいろ','問題':'もんだい','発表':'はっぴょう','題名':'だいめい',
  '横':'よこ','縦':'たて','右':'みぎ','左':'ひだり','上':'うえ','下':'した','前':'まえ','後':'うし','中':'なか','間':'あいだ',
  '端':'はし','奥':'おく','元':'もと','方':'ほう','目':'め','数':'かず','値':'あたい','秒':'びょう','歩':'ほ','回':'かい',
  '度':'ど','個':'こ','体':'たい','点':'てん','色':'いろ','線':'せん','音':'おと','姿':'すがた','今':'いま','次':'つぎ',
  '何':'なに','一':'いち','空':'そら','道':'みち','行':'い','動':'うご','返':'かえ','続':'つづ','決':'き','向':'む',
  '進':'すす','追':'お','近':'ちか','変':'か','始':'はじ','待':'ま','入':'い','新':'あたら','足':'た','増':'ふ','減':'へ',
  '引':'ひ','消':'け','終':'お','残':'のこ','分':'わ','繰':'く','見':'み','調':'しら','言':'い','話':'はな','答':'こた',
  '尋':'たず','聞':'き','送':'おく','知':'し','受':'う','作':'つく','呼':'よ','出':'で','使':'つか','止':'と','触':'ふ',
  '跳':'は','隠':'かく','重':'かさ','押':'お','太':'ふと','鳴':'な','高':'たか','読':'よ','同':'おな','大':'おお',
  '小':'ちい','求':'もと','余':'あま','切':'き','捨':'す','直':'なお','長':'なが','取':'と','当':'あ','落':'お','速':'はや',
  '問':'と','題':'だい','発':'はつ','表':'ひょう','示':'じ','名':'な','記':'き','録':'ろく','代':'だい',
}).sort((a, b) => b[0].length - a[0].length));
export function normalizeSearchText(value: unknown): string {
  return String(value || '').normalize('NFKC').toLocaleLowerCase()
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/\s+/g, '');
}
const SEARCH_READING_CACHE = new Map<string, string>();
export function searchReading(value: unknown): string {
  let text = normalizeSearchText(value);
  const known = SEARCH_READING_CACHE.get(text);
  if (known !== undefined) return known;
  const key = text;
  for (const [word, reading] of SEARCH_READINGS) {
    if (word.startsWith('(数)')) text = text.replace(new RegExp('(?<=[0-9])' + word.slice(3) + '(?!目)', 'g'), () => (reading));
    else if (text.includes(word)) text = text.split(word).join(reading);
  }
  if (SEARCH_READING_CACHE.size >= 2000) SEARCH_READING_CACHE.clear();
  SEARCH_READING_CACHE.set(key, text);
  return text;
}
