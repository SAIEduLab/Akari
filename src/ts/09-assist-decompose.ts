import { EVENT_BY_TYPE, hintCandidates, keySurface } from './02-language-contracts.ts';
import { nameSource } from './03-default-assets.ts';
import { CONDITION_FORMS, SENTENCE_FORMS, parseCondition, parseExpression, parseSyntax, sentenceRoleSlots } from './04-syntax-expressions.ts';
import { sentenceHeadingSource, sentenceQuantity } from './04-syntax-sentences.ts';
import { MEIJIN_WORD, meijinDictionary, meijinRewrite, meijinWordCheck, meijinWordSpelling, meijinWordTest } from './04-meijin-syntax.ts';
import { BLOCK_SCHEMA_BY_ID, syntaxSchema } from './05-command-presentation.ts';
import { formatScript } from './06-source-formatting.ts';
import { BASIC_BLOCK_SCHEMA_IDS, searchReading } from './09-editor-sessions.ts';
import { BLOCK_SEARCH_SYNONYMS, hintSchemaId, matchesSearch, searchIntent, searchQueryVariants } from './09-editor-search-core.ts';
import { ASSIST_MAX, ASSIST_MAX_CLAUSES, ASSIST_MAX_DEPTH, ASSIST_MAX_SKELETONS, assistCanonical, assistCanonicalTemplate, assistClauseForms, assistEscapeRegex, assistLongestFirst, assistNormalizeLattice, assistNumberText, assistSeeds, assistSplit } from './09-assist-normalize.ts';
import { assistConditionEnds } from './09-assist-verify.ts';
import type { AssistContext, AssistData, AssistFilled, AssistHint, AssistNameKind, AssistRange, AssistRanked, AssistRow, AssistRunState, AssistSkeleton, AssistSource } from '../types/assist.d.ts';
import type { BlockSchema } from '../types/blocks.d.ts';
import type { RoleSlot } from '../types/parse.d.ts';
import type { Project } from '../types/project.d.ts';
import type { SearchIntent } from '../types/editor.d.ts';
import type { ActorRef, Heading, UnfilteredHeading } from '../types/syntax-base.d.ts';
import type { Expression } from '../types/syntax.d.ts';

// ────────────────────────────────────────────────────────────────────────
// 09 — Code assist stages 1-3: structural decomposition, search, transforms
// ────────────────────────────────────────────────────────────────────────

export function assistHintSearchSynonyms(id: string) {
  const schemaId = hintSchemaId(id);
  const builtin = /^builtin:(.+)$/.exec(schemaId);
  return (builtin ? BLOCK_SEARCH_SYNONYMS['BuiltinCall:' + builtin[1]] : BLOCK_SEARCH_SYNONYMS[schemaId]) || [];
}

function assistHeadings(project: Project, ctx: AssistContext, data: AssistData): AssistHint[] {
  if (ctx.definitionKind || ctx.meijin || ctx.targetId === 'stage') return [];
  const owner = project.components.find(c => c.id === ctx.targetId);
  if (!owner) return [];
  const key = data.keys[0];
  const touch = data.text.includes('画面のはし') ? '端' : data.names.find(n => n.kind === 'part' && n.name !== owner.name)?.name || project.components.find(c => c.id !== owner.id)?.name || '端';
  const inputs = project.components.filter(c => c.type === 'input');
  const out: AssistHint[] = [];
  for (const event of new Set(Object.values(EVENT_BY_TYPE).flat())) {
    if (event === 'interval' || event === 'conditionTrue') continue;
    if (['click', 'cloneStart'].includes(event) && data.names.some(n => n.kind === 'part' && n.name !== owner.name)) continue;
    if (event !== 'valueChanged' && data.subject && data.subject !== owner.name && !['自分', '体'].includes(data.subject)) continue;
    const variants: ({ name: string; message?: never } | { message: string; name?: never } | { name?: never; message?: never })[] =
      event === 'valueChanged' ? (data.names.some(n => n.kind === 'part') ? inputs.filter(input => data.names.some(n => n.name === input.name)) : inputs)
        : event === 'message' ? (data.strings.length ? data.strings.map(message => ({ message })) : [{}])
          : [{}];
    for (const variant of variants) {
      const actorRef: ActorRef = event === 'valueChanged' ? { kind: 'named', name: variant.name as string } : data.subject === owner.name && !['keyDown', 'message'].includes(event) ? { kind: 'named', name: owner.name } : { kind: 'self' };
      try {
        const text = sentenceHeadingSource({ event, actorRef, filter: event === 'keyDown' ? (key ? { key } : null) : event === 'message' ? (variant.message !== undefined ? variant : null) : event === 'touchStart' ? { target: touch } : null } as Heading | UnfilteredHeading);
        out.push({ id: 'Heading:' + event, text, mode: 'statement', enabled: true, terms: { text: [text], synonyms: BLOCK_SEARCH_SYNONYMS['Heading:' + event] || [], verbForms: [], nounForms: [], intent: [], acceptedReadings: [] } });
      } catch {}
    }
  }
  return out;
}

function assistSlotNameKind(slot: Pick<RoleSlot, 'label'>) {
  return ({ 音: 'sound', すがた: 'costume', はいけい: 'backdrop', 部品: 'part', 入力らん: 'part', 行く相手: 'part', 向く相手: 'part', コピーの元: 'part', リスト: 'list', 調べるリスト: 'list', かえるもの: 'variable' } as Partial<Record<string, AssistNameKind>>)[slot.label];
}

// Template AST Memoization: catalog hints are parsed once per context and cloned before slot filling.
export function assistFillHint(hint: AssistHint, data: AssistData, project: Project, ctx: AssistContext, intent: SearchIntent | null = null, state?: AssistRunState): AssistFilled | null {
  type Place = { kind?: string; op?: string; unit?: string; name?: string; value?: unknown; [key: string]: unknown };
  type FillNode = Place & { kind: string; args?: Expression[]; condition?: Expression };
  const parsed = assistCanonicalTemplate(hint.text, ctx, state?.templateCache);
  if (!parsed) return null;
  const ast = parsed.ast;
  const node = ast.body?.[0] as FillNode | undefined || ast.rules?.[0] as FillNode | undefined;
  if (!node || hint.id.startsWith('Heading:')) return { ...hint, text: parsed.text, filled: 0 };
  if (node.kind === 'Say' && data.numbers.some(n => n.unit === '秒')) node.seconds = sentenceQuantity({ kind: 'NumberLiteral', value: data.numbers.find(n => n.unit === '秒')!.value }, '秒');
  const filled = new Set<string>();
  const boundKinds = new Set<AssistNameKind>();
  const slots = sentenceRoleSlots(node.kind, node.op, node.seconds ? 'timedSpeech' : null);
  const get = (o: unknown, p: string) => p.split('.').reduce<unknown>((v, k) => (v as Place | undefined)?.[k], o) as Place | undefined;
  const put = (o: Place, p: string, v: unknown) => {
    const keys = p.split('.');
    for (const k of keys.slice(0, -1)) {
      if (!o[k]) return false;
      o = o[k] as Place;
    }
    o[keys.at(-1)!] = v;
    return true;
  };
  const literal = (value: number): Expression => value < 0 ? { kind: 'UnaryExpression', op: 'NEG', value: { kind: 'NumberLiteral', value: -value } } : { kind: 'NumberLiteral', value };
  const isNumber = (n: Place | undefined) => n?.kind === 'NumberLiteral' || n?.kind === 'QuantityLiteral' && (n.value as Place | undefined)?.kind === 'NumberLiteral';
  const numberAt = (slot: Pick<RoleSlot, 'path'>, value: number) => {
    const old = get(node, slot.path);
    const changed = put(node, slot.path, old?.kind === 'QuantityLiteral' ? { ...old, value: literal(value) } : literal(value));
    if (changed) filled.add(slot.path);
    return changed;
  };
  if (intent) {
    if (intent.schemaId === 'MotionCommand:MOVE_BY' && intent.direction) {
      const vertical = ['up', 'down'].includes(intent.direction);
      if (vertical && node.x) { node.y = node.x; delete node.x; }
      node[vertical ? 'yDir' : 'xDir'] = intent.direction;
    } else if (intent.direction && ('direction' in node)) {
      node.direction = intent.direction;
    }
    if (intent.scale !== undefined && node.args?.[0]) numberAt({ path: 'args.0' }, intent.scale);
    if (intent.schemaId === 'MotionCommand:SET_DIRECTION' && intent.direction) {
      const word = ({ right: '右', left: '左', up: '上', down: '下' } as Partial<Record<string, string>>)[intent.direction];
      const directionAst = parseSyntax('画面の' + word + 'を向く。', ctx).ast;
      if (directionAst?.body?.[0]?.args) node.args = directionAst.body[0].args as Expression[];
    } else if (intent.value !== undefined) {
      const s = slots.find(s => s.type === 'expression' && isNumber(get(node, s.path)));
      if (s) numberAt(s, intent.value!);
    }
    if (intent.color && node.args?.[0]) node.args[0] = { kind: 'StringLiteral', value: intent.color };
    if (intent.index !== undefined && node.index) numberAt({ path: 'index' }, intent.index!);
    if (intent.empty && node.args?.[1]) node.args[1] = { kind: 'StringLiteral', value: '' };
  }
  const used = new Set<number>();
  const slotUnit = (s: RoleSlot) => s.unit || get(node, s.path)?.unit || ({ いくつ: 'つ', 音の高さ: '段階' } as Partial<Record<string, string>>)[s.label];
  for (const s of slots) {
    if (s.type !== 'expression') continue;
    const old = get(node, s.path);
    if (!old) continue;
    const number = data.numbers.find((n, i) => !used.has(i) && n.unit && n.unit === slotUnit(s));
    if (number && isNumber(old)) {
      numberAt(s, number.value);
      used.add(data.numbers.indexOf(number));
      filled.add(s.path);
    }
  }
  const nameKinds = new Set(slots.map(assistSlotNameKind).filter(Boolean));
  const values = data.strings.filter(value => !data.names.some(name => name.name === value && nameKinds.has(name.kind)));
  const stringSlots = slots.filter(s => s.type === 'expression' && !s.unit && !assistSlotNameKind(s) && (get(node, s.path)?.kind === 'StringLiteral' || get(node, s.path)?.kind === 'NumberLiteral' && ['新しい中身', '入れるもの', 'はじめの 中身', '答え'].includes(s.label)));
  if (values.length && stringSlots.length === 1) { put(node, stringSlots[0].path, { kind: 'StringLiteral', value: values[0] }); filled.add(stringSlots[0].path); }
  const remaining = data.numbers.filter((n, i) => !used.has(i) && !n.unit);
  const numberSlots = slots.filter(s => s.type === 'expression' && isNumber(get(node, s.path)) && !data.numbers.some(n => n.unit && n.unit === s.unit));
  if (remaining.length && numberSlots.length === 1) { numberAt(numberSlots[0], remaining[0].value); filled.add(numberSlots[0].path); }
  const made = /(?:させ|せる|かす|かせ)(?:る)?$/.test(data.text) ? project.components.map(c => c.name).find(name => ['を', 'に'].some(p => data.text.startsWith(name + p) || data.text.startsWith('「' + name + '」' + p))) : null;
  const goer = made || (data.subject ? null : project.components.find(c => c.id === ctx.targetId)?.name);
  data = { ...data, names: [...data.names].sort((a, b) => Number(a.name === goer) - Number(b.name === goer)) };
  const owned = (old: Place, name: string) => {
    const scopeData = old.qualifier === 'self' ? project.components.find(c => c.id === ctx.targetId)?.localData : old.qualifier === 'project' ? project.projectData : null;
    return ['self', 'project'].includes(String(old.qualifier)) && ![...scopeData?.variables || [], ...scopeData?.lists || []].some(v => v.name === name) ? { qualifier: null } : {};
  };
  for (const s of slots) {
    const kind = assistSlotNameKind(s);
    if (!kind) continue;
    const name = data.names.find(n => n.kind === kind || kind === 'variable' && ['list', 'argument', 'local'].includes(n.kind));
    if (!name) continue;
    const old = get(node, s.path);
    if (!old) continue;
    if (old.kind === 'StringLiteral') put(node, s.path, { ...old, value: name.name });
    else if (typeof old.name === 'string') put(node, s.path, { ...old, name: name.name, ...owned(old, name.name) });
    filled.add(s.path);
    boundKinds.add(name.kind);
  }
  if (hint.binding) {
    const name = data.names.find(n => ['variable', 'list', 'argument', 'local'].includes(n.kind));
    if (name) {
      for (const s of slots) {
        const old = get(node, s.path);
        if (old && old.name === hint.binding.name) {
          Object.assign(old, { name: name.name }, owned(old, name.name));
          filled.add(s.path);
          boundKinds.add(name.kind);
        }
      }
    }
  }
  if (['Say', 'ReturnStatement', 'LooksCommand'].includes(node.kind)) {
    const name = data.names.find(n => ['variable', 'argument', 'local'].includes(n.kind));
    if (name) {
      const s = slots.find(s => ['value', 'args.1'].includes(s.path));
      if (s) {
        try { put(node, s.path, parseExpression(nameSource(name.name), ctx.symbols, ctx)); filled.add(s.path); boundKinds.add(name.kind); } catch {}
      }
    }
  }
  if (node.kind === 'UserActionCall') {
    const args = project.actions.find(a => a.name === node.name)?.args || [];
    const namedArgs = args.map((name, index) => ({ name, index, escaped: assistEscapeRegex(name) })).sort((a, b) => b.name.length - a.name.length);
    const assigned = new Set<number>();
    const prefixArg = (value: { at: number }) => namedArgs.find(({ escaped }) => new RegExp('(?:^|[、はがをにへとので])' + escaped + '(?:を|は)$').test(data.text.slice(0, value.at)));
    const suffixArg = (value: { end: number }) => namedArgs.find(({ escaped }) => new RegExp('^(?:を)?' + escaped + '(?:として|にして|に)').test(data.text.slice(value.end)));
    const nameValues = data.names.filter(n => ['variable', 'list', 'local', 'argument'].includes(n.kind)).flatMap(n => {
      const escaped = assistEscapeRegex(n.name);
      return [...data.text.matchAll(new RegExp('(?:^|(?<=[はがをにへとので、 【]))' + escaped + '(?=$|[はがをにへとので、 】])', 'g'))].map(m => {
        const wrapped = data.text[m.index - 1] === '【' && data.text[m.index + m[0].length] === '】';
        return { name: n.name, wrapped, at: m.index - (wrapped ? 1 : 0), end: m.index + m[0].length + (wrapped ? 1 : 0), value: parseExpression(nameSource(n.name), ctx.symbols, ctx) };
      });
    }).filter(n => !data.stringValues.some(s => s.at <= n.at && n.end <= s.end) && !(args.includes(n.name) && !n.wrapped && !prefixArg(n) && !suffixArg(n) && /^(?:を|は|として)/.test(data.text.slice(n.end))));
    const argValues: { at: number; end: number; value: Expression; index?: number }[] = [
      ...data.numbers.filter(n => !n.unit).map(n => ({ at: n.at, end: n.end, value: literal(n.value) })),
      ...data.stringValues.map(s => ({ ...s, value: { kind: 'StringLiteral' as const, value: s.value } })),
      ...nameValues,
    ].sort((a, b) => a.at - b.at);
    for (const value of argValues) {
      value.index = (prefixArg(value) || suffixArg(value))?.index ?? -1;
      if (value.index >= 0) { node.args![value.index] = value.value; assigned.add(value.index); filled.add('args.' + value.index); }
    }
    for (const value of argValues.filter(v => v.index! < 0)) {
      const index = node.args!.findIndex((_, i) => !assigned.has(i));
      if (index < 0) break;
      node.args![index] = value.value;
      assigned.add(index);
      filled.add('args.' + index);
    }
  }
  if (node.kind === 'CloneCommand' && ['CREATE_SELF', 'CREATE_TARGET'].includes(node.op)) {
    const n = data.numbers.find(n => ['count', 'つ'].includes(n.unit));
    if (n) { node.count = literal(n.value); filled.add('count'); }
  }
  if (['LocalVariableDeclaration', 'LocalListDeclaration'].includes(node.kind)) {
    const name = /【([^【】]+)】/.exec(data.text)?.[1] || /^(.+?)という(?:変数|へんすう|リスト)/.exec(data.text)?.[1];
    if (name) { node.name = name; filled.add('name'); }
  }
  if (node.condition?.kind === 'SensorRead' && node.condition.sensor === 'KEY_DOWN' && data.keys.length) {
    node.condition.arg = { kind: 'StringLiteral', value: data.keys[0] };
    filled.add('condition.arg');
  }
  if (node.condition) {
    const conditions = [data.text.replace(/(?:、?くり返す|待つ|待って)$/, '').replace(/のを$/, 'まで'), data.clauses[0]?.text.replace(/^もし/, '')];
    conditionLoop: for (const condition of conditions) {
      for (const form of ['if', 'while', 'until', 'plain'] as const) {
        try { node.condition = parseCondition(condition as string, ctx.symbols, ctx, form); filled.add('condition'); break conditionLoop; } catch {}
      }
    }
  }
  try {
    let text = formatScript(ast, { symbols: ctx.symbols }).trim();
    if (ctx.assistExistingBody && ['IfStatement', 'Forever', 'RepeatCount', 'RepeatWhile', 'RepeatUntil', 'ForEach'].includes(node.kind)) text = text.split('\n')[0];
    return { ...hint, text, filled: filled.size, defaultNumericSlots: slots.some(s => s.type === 'expression' && isNumber(get(node, s.path)) && !filled.has(s.path)), conditionFilled: filled.has('condition') || filled.has('condition.arg'), boundKinds: [...boundKinds], valueChoices: stringSlots.length === 1 ? values : [] };
  } catch { return null; }
}

export function assistSearch(project: Project, basis: string, range: AssistRange, ctx: AssistContext, data: AssistData, state?: AssistRunState): AssistRow[] {
  type Found = { schemaId: string; origin: string; layer: number; rank: number; fragment: boolean; order: number; intent: SearchIntent | null | undefined; exact: boolean; inText: boolean | undefined };
  const all = hintCandidates(project, ctx.targetId, { ...ctx, source: basis, start: range.lineStart + range.indent, end: range.lineEnd });
  const candidates: AssistHint[] = all.filter(h => h.mode === 'statement' && h.enabled);
  if (range.indent === 0 && (/、$/.test(range.text) || /(?:たら|とき|ごと|たび)、?$/.test(range.text))) candidates.push(...assistHeadings(project, ctx, data));
  const ranked: AssistRow[] = [];
  const fallbacks: AssistRow[] = [];
  const matchedCache = new Map<string, boolean>();
  const match = (words: string, seed: string) => {
    const key = words + '\0' + seed;
    if (!matchedCache.has(key)) matchedCache.set(key, matchesSearch(words, seed));
    return matchedCache.get(key);
  };
  const nextLine = basis.slice(range.lineEnd + 1).split('\n')[0] || '';
  const fillContext = { ...ctx, assistExistingBody: nextLine.trim() && nextLine.match(/^\s*/)![0].length > range.indent };
  const spriteNames = new Set(project.components.filter(c => c.type === 'sprite').map(c => c.name));
  const namedIntent = (seed: string): SearchIntent | null => {
    if (data.names.some(n => n.kind === 'part' && project.components.some(c => c.name === n.name && ['label', 'button', 'box'].includes(c.type))) && data.names.some(n => ['variable', 'list'].includes(n.kind)) && /^「[^「」]+」を.+にする$/.test(data.text)) return { schemaId: 'LooksCommand:SET_TARGET_TEXT' };
    if (data.names.some(n => ['action', 'function'].includes(n.kind)) && /行う|行って|呼び|させる|わた|として|てじゅん|手順/.test(data.text)) return null;
    if (data.names.some(n => ['action', 'function'].includes(n.kind) && new RegExp('^' + assistEscapeRegex(searchReading(n.name)) + '(?:する|して|したい|させる)?$').test(searchReading(seed).replace(/[【】]/g, '')))) return null;
    let read = seed.replace(/「([^「」]*)」/g, (quote: string, value: string) => !spriteNames.has(value) && data.names.some(n => n.name === value) ? quote : '「□」');
    for (const name of [...spriteNames].sort(assistLongestFirst)) read = read.split(name).join('「□」');
    let intent = searchIntent(read, ctx);
    if (/(?:にする|になる|かえる)$/.test(seed)) {
      const image = data.names.find(n => ['costume', 'backdrop'].includes(n.kind));
      if (image) intent = { schemaId: image.kind === 'costume' ? 'LooksCommand:SET_COSTUME' : 'LooksCommand:SET_BACKDROP' };
    }
    if (data.strings.length && /と(?:伝える|つたえる)$/.test(seed)) intent = { schemaId: 'Broadcast' };
    if (data.strings.length && /(?:と|って)(?:きく|聞く)$/.test(seed)) intent = { schemaId: 'Ask' };
    const scalar = data.names.some(n => ['variable', 'argument', 'local'].includes(n.kind)) || (project.projectData?.variables || []).length === 1 && /^.+?を\d+(?:あげる|上げる)$/.test(seed);
    const list = data.names.some(n => n.kind === 'list');
    if (scalar && /^LooksCommand:SET_SCALE$/.test(intent?.schemaId || '')) intent = null;
    if (scalar && /マイナス|へら|へる|減ら|減る|小さく/.test(seed)) intent = { schemaId: 'NumericUpdate:SUB' };
    else if (scalar && /ふや|増や|ふえる|増える|たす|足す|大きく|あげる|上げる|上がる|あがる/.test(seed)) intent = { schemaId: 'NumericUpdate:ADD' };
    if (list && !/番|ばんめ|つ目|つめ/.test(seed) && /消す|けす|削除|クリア|からに|空に|(?:全部|ぜんぶ)すてる/.test(seed)) intent = { schemaId: 'ListClear' };
    if (list && /番|ばんめ|つ目|つめ/.test(seed) && /消す|けす/.test(seed)) intent = { schemaId: 'ListDelete' };
    if (list && /の中に.*入れる$/.test(seed)) intent = { schemaId: 'ListAppend' };
    if (list && /中身.*(?:全部|ぜんぶ)?(?:言う|いう)$/.test(seed)) intent = { schemaId: 'Say' };
    if (/(?:ふれる|おされる|おす)(?:のを|まで)(?:待つ|まつ|待って)$/.test(seed)) intent = { schemaId: 'WaitUntil' };
    if (data.strings.length && /と(?:小さな声で|大きな声で)?(?:言う|いう|話す)$/.test(seed)) intent = { schemaId: 'Say' };
    if (data.strings.length && /言って答えを待つ$/.test(seed)) intent = { schemaId: 'Ask' };
    if (data.names.some(n => n.kind === 'sound') && /聞かせる|きかせる/.test(seed)) intent = { schemaId: 'SoundCommand:SAMPLE_WAIT' };
    if (data.names.some(n => n.kind === 'part' && project.components.some(c => c.name === n.name && ['label', 'button', 'box'].includes(c.type))) && data.names.some(n => ['variable', 'list'].includes(n.kind)) && /^「[^「」]+」を.+にする$/.test(data.text)) intent = { schemaId: 'LooksCommand:SET_TARGET_TEXT' };
    if (data.names.some(n => n.kind === 'sound') && /止める|とめる|ストップ/.test(seed)) intent = searchIntent('音を止める', ctx);
    if (intent?.schemaId === 'LooksCommand:SET_COLOR' && data.keys.some(key => seed.includes(key) || seed.includes(keySurface(key)))) return null;
    return intent;
  };
  const mainIntent = namedIntent(data.text) || data.seeds.filter(s => !s.fragment).map(s => namedIntent(s.text)).find(Boolean);
  const seeds = data.seeds.map((seed, index) => ({ ...seed, intent: mainIntent ? index === 0 ? mainIntent : null : namedIntent(seed.text) }));
  const restrictMotion = mainIntent && /^MotionCommand:/.test(mainIntent.schemaId) && mainIntent.schemaId !== 'MotionCommand:GOTO' && mainIntent.direction !== 'backward';
  const mainText = data.clauses.at(-1)?.text || data.text;
  const tail = mainText.replace(/「[^「」]*」|【[^【】]*】/g, '').split(/[をにへとでがはの、\d歩秒度％]+/).filter(Boolean).at(-1) || '';
  const actionVerbs = [...new Set([...searchQueryVariants(tail.replace(/^(?:何回も|何度も|なんかいも|なんども)/, '')), ...seeds.filter(seed => seed.fragment).map(seed => seed.text)].filter(word => word.length >= 2 && /[うくぐすつぬぶむる]$/.test(word) && !/^(?:する|なる|ある|いる|にする|になる)$/.test(word)))];
  const sourceWords = [...new Set(data.clauses.flatMap(clause => clause.text.replace(/「[^「」]*」|【[^【】]*】/g, '').replace(/\d+(?:\.\d+)?(?:歩|秒|度|％|回|番目|Hz)?/g, '').split(/[をにへとでがはの、]/)).filter(Boolean))];
  for (let order = 0; order < candidates.length; order++) {
    const h = candidates[order];
    const id = hintSchemaId(h.id).replace(/:timed$/, '');
    const terms = h.terms || { text: [h.text.split('\n')[0]], synonyms: assistHintSearchSynonyms(h.id), verbForms: [], nounForms: [], intent: [], acceptedReadings: [] };
    let best: Found | null = null;
    let exactSeen = false;
    let matchLength = 0;
    if (data.headerEvent && id !== 'Heading:' + data.headerEvent) continue;
    if (restrictMotion && /^MotionCommand:/.test(id) && id !== mainIntent.schemaId) continue;
    if (mainIntent?.schemaId === 'MotionCommand:GOTO' && ['MotionCommand:MOVE', 'MotionCommand:MOVE_BY', 'ContinuousRule'].includes(id)) continue;
    if (mainIntent?.schemaId === 'ContinuousRule' && /^MotionCommand:/.test(id)) continue;
    if (mainIntent && /^MotionCommand:/.test(mainIntent.schemaId) && ['UserActionCall', 'ForEach'].includes(id) && !data.names.some(n => n.kind === 'action')) continue;
    if (/のところ(?:へ|に|まで)(?:走|はし|とぶ|動)/.test(data.text) && /^MotionCommand:/.test(id) && id !== 'MotionCommand:GOTO_PART') continue;
    if (/背景|はいけい/.test(data.text) && /もどす|戻す/.test(data.text) && id === 'LooksCommand:PREV_COSTUME') continue;
    if (/すがた|姿|コスチューム/.test(data.text) && /もどす|戻す/.test(data.text) && id === 'LooksCommand:PREV_BACKDROP') continue;
    if (h.id.endsWith(':timed') && !data.numbers.some(n => n.unit === '秒')) continue;
    if (id === 'Say' && /秒.*(?:話す|はなす|言う|いう)/.test(h.text) && !data.numbers.some(n => n.unit === '秒')) continue;
    const strictIntent = ['PenCommand:SET_COLOR', 'PenCommand:SET_SIZE', 'PenCommand:STAMP', 'PenCommand:DOWN', 'PenCommand:CLEAR', 'SoundCommand:SET_VOLUME', 'SoundCommand:PITCH_UP', 'SoundCommand:PITCH_DOWN', 'TimerReset', 'WaitTime', 'WaitUntil', 'LooksCommand:SET_TARGET_TEXT', 'LooksCommand:SET_INPUT', 'ListClear', 'ListAppend'];
    const intentAlternative = mainIntent?.schemaId === 'PenCommand:SET_COLOR' && id === 'PenCommand:DOWN' && /線.*かく/.test(data.text) || mainIntent?.schemaId === 'SoundCommand:SET_VOLUME' && id === 'SoundCommand:STOP_ALL' && /ミュート|みゅーと/.test(data.text) || mainIntent?.schemaId === 'ListAppend' && id === 'ListInsert' && /の中に.*入れる$/.test(data.text);
    if (mainIntent && strictIntent.includes(mainIntent.schemaId) && id !== mainIntent.schemaId && !intentAlternative) continue;
    if (mainIntent?.schemaId === 'LooksCommand:SET_SCALE' && /大きさ|おおきさ|さいず/.test(data.text) && id === 'SoundCommand:SET_VOLUME') continue;
    if (mainIntent?.schemaId === 'RepeatCount' && id !== 'RepeatCount') continue;
    if (ctx.definitionKind === 'function' && id === 'ForEach' && /順|一つずつ/.test(data.text) && /言う|話す/.test(data.text)) continue;
    if (id === 'ContinuousRule' && !/あいだ|間|おしっぱなし/.test(data.text)) continue;
    if (mainIntent && ['NumericUpdate:ADD', 'NumericUpdate:SUB'].includes(mainIntent.schemaId) && id !== mainIntent.schemaId && !/ずつ|が.*あいだ|が.*まで/.test(data.text)) continue;
    const dataKind = data.names.find(n => ['variable', 'list', 'argument', 'local'].includes(n.kind))?.kind;
    if (h.binding && ['scalar', 'list'].includes(h.binding.kind) && dataKind && (h.binding.kind === 'list') !== (dataKind === 'list')) continue;
    if (h.binding && ['scalar', 'list'].includes(h.binding.kind) && !dataKind && /^.+?を(?:\d+|[一二三四五六七八九十]|マイナス)/.test(data.text) && ((h.binding.kind === 'list' ? project.projectData?.lists : project.projectData?.variables) || []).length !== 1) continue;
    if (dataKind && /^LooksCommand:SET_SCALE$/.test(id) && mainIntent?.schemaId !== 'LooksCommand:SET_SCALE') continue;
    if (id === 'UserActionCall' && !data.names.some(n => n.kind === 'action')) continue;
    const own = [...(terms.text || []), ...(terms.synonyms || []), ...(terms.verbForms || []), ...(terms.nounForms || [])];
    const shortWords = [...own, ...(terms.text || []).flatMap(word => word.replace(/\d+(?:\.\d+)?(?:つ|段階|秒|歩|回|番目|度|％)/g, '').split(/[をにへとでがはの、。\d]+/))];
    const keyHit = id === 'Heading:keyDown' && data.keys.some(key => match(h.text, keySurface(key)));
    const verbHit = keyHit || actionVerbs.some(verb => match(own.join(' '), verb) || verb.endsWith('する') && verb.length > 2 && match(own.join(' '), verb.slice(0, -2))) || own.some(word => word.length >= 2 && /[うくぐすつぬぶむる]$/.test(word) && data.seeds.some(seed => !seed.fragment && searchReading(seed.text).endsWith(searchReading(word)))) || (terms.synonyms || []).some(word => searchReading(data.text) === searchReading(word) || searchReading(data.text) === 'げーむ' + searchReading(word));
    for (const seed of seeds) {
      const intent = seed.intent;
      if (intent && intent.schemaId !== id && !intentAlternative && !(h.binding && match(h.binding.name, seed.text))) continue;
      let layer = 6;
      let found = false;
      const unitOnly = /^-?\d+(?:\.\d+)?(歩|秒|度|％|回|番目|Hz|つ|段階)$/.exec(seed.text);
      if (unitOnly) {
        const schema = BLOCK_SCHEMA_BY_ID.get(id);
        const slots = SENTENCE_FORMS.filter(f => f.kind === schema?.kind && (!f.op || f.op === (schema as BlockSchema & { op?: undefined } | undefined)?.op || id === f.kind + ':' + f.op)).flatMap(f => f.roleSlots);
        if (!slots.some(slot => slot.unit === unitOnly[1])) continue;
        found = true;
        layer = 5;
      } else if (intent?.schemaId === id || intentAlternative && seed === seeds[0]) {
        found = true;
        layer = intentAlternative ? 5 : 4;
      } else if (data.headerEvent && id === 'Heading:' + data.headerEvent && seed === seeds[0]) {
        found = true;
        layer = 5;
      } else {
        for (const word of ([...seed.text].length <= 2 ? shortWords : own)) {
          const short = [...seed.text].length <= 2;
          const phrase = (terms.synonyms || []).includes(word) && word.search(/[をにへとでがはの]/) > 0;
          const hit = short ? searchReading(word) === searchReading(seed.text) : phrase ? match(seed.text, word) : match(word, seed.text);
          if (hit) { found = true; layer = 5; break; }
        }
      }
      if (!found && [...seed.text].length > 2 && match([...(terms.intent || []), ...(terms.acceptedReadings || [])].join(' '), seed.text)) found = true;
      if (!found) continue;
      const nounException = data.headerEvent && id === 'Heading:' + data.headerEvent || id === 'MotionCommand:BOUNCE' && searchReading(h.text).startsWith(searchReading(data.clauses[0].text + '、')) || id === 'MotionCommand:MOVE' && /^前に来る$/.test(data.text) || id === 'MotionCommand:GOTO_PART' && /のところ(?:へ|に|まで)(?:走|はし|とぶ|動)/.test(data.text) || ['LooksCommand:FRONT', 'LooksCommand:FORWARD_LAYERS'].includes(id) && /手前|てまえ/.test(data.text) || ['LooksCommand:BACK', 'LooksCommand:BACKWARD_LAYERS'].includes(id) && /おく|奥|後ろに下がる/.test(data.text) || ['Broadcast', 'BroadcastAndWait'].includes(id) && /(?:合図|メッセージ).*出す/.test(data.text);
      if (layer === 5 && actionVerbs.length && !verbHit && !nounException && !intentAlternative) layer = 6;
      const exact = own.some(w => searchReading(w) === searchReading(seed.text));
      exactSeen ||= exact;
      matchLength = Math.max(matchLength, seed.text.length);
      const row = { schemaId: id, origin: 'S3', layer, rank: seed.rank, fragment: seed.fragment, order, intent: layer === 4 ? intent : null, exact, inText: actionVerbs.length ? actionVerbs.some(verb => searchReading(terms.text.join(' ')).includes(searchReading(verb))) : match(terms.text.join(' '), seed.text) };
      if (!best || row.layer < best.layer || row.layer === best.layer && (row.rank < best.rank || row.rank === best.rank && Number(row.fragment) < Number(best.fragment))) best = row;
    }
    if (best) {
      const filled = assistFillHint(h, data, project, fillContext, best.intent || (id === 'MotionCommand:MOVE_BY' && searchReading(data.text) === 'はねる' ? { schemaId: id, direction: 'up' } : null), state);
      if (filled) {
        const words = sourceWords.filter(word => match(own.join(' '), word));
        const named = id === 'UserActionCall' && data.names.some(n => n.kind === 'action' && h.text.includes(n.name)) || id === 'MotionCommand:GOTO_PART' && /のところ(?:へ|に|まで)(?:走|はし|とぶ|動)/.test(data.text);
        const row = { ...filled, ...best, named, exact: exactSeen, wordCount: words.length, matchLength: words.length ? Math.max(...words.map(word => word.length)) : matchLength };
        if (['IfStatement', 'RepeatWhile', 'RepeatUntil', 'WaitUntil'].includes(id) && !filled.conditionFilled) row.layer = 6;
        if (named) { row.layer = Math.min(row.layer, 5); row.rank = 0; row.fragment = false; }
        ranked.push(row);
        if (best.layer === 6 && filled.boundKinds?.length) fallbacks.push({ ...row, layer: 5, rank: 10, fragment: true, wordCount: 0 });
        if (filled.valueChoices?.length! > 1) {
          for (const [i, value] of filled.valueChoices!.slice(1).entries()) {
            const alternative = assistFillHint(h, { ...data, strings: [value] }, project, fillContext, best.intent, state);
            if (alternative) ranked.push({ ...row, ...alternative, order: order + (i + 1) / 100 });
          }
        }
      }
      if (best.intent?.directions) {
        for (const direction of best.intent.directions.slice(1)) {
          const alt = assistFillHint(h, data, project, fillContext, { ...best.intent, direction }, state);
          if (alt) ranked.push({ ...alt, ...best, order: order + 0.1 });
        }
      }
    } else if (data.names.length) {
      const schema = BLOCK_SCHEMA_BY_ID.get(id);
      const slots = schema ? sentenceRoleSlots(schema.kind, id.split(':')[1]) : [];
      const nameSlot = slots.some(slot => data.names.some(n => n.kind === assistSlotNameKind(slot))) || ['Say', 'ReturnStatement', 'LooksCommand:SET_TARGET_TEXT'].includes(id) && data.names.some(n => ['variable', 'list', 'local', 'argument'].includes(n.kind));
      if (nameSlot) {
        const filled = assistFillHint(h, data, project, fillContext, null, state);
        if (filled?.boundKinds?.length) fallbacks.push({ ...filled, schemaId: id, origin: 'S3', layer: 5, rank: 10, fragment: true, order: candidates.length + order, exact: false, inText: false, wordCount: 0, matchLength: 0 });
      }
    }
  }
  const covered = new Set(ranked.filter(r => r.layer < 6).flatMap(r => r.boundKinds || []));
  const anyVerb = actionVerbs.some(verb => all.some(h => {
    const t = h.terms;
    return t && match([...(t.text || []), ...(t.synonyms || []), ...(t.verbForms || []), ...(t.nounForms || [])].join(' '), verb);
  }));
  ranked.push(...fallbacks.filter(r => !anyVerb && r.boundKinds!.some(kind => !covered.has(kind))));
  const noImageName = !data.names.some(n => ['costume', 'backdrop'].includes(n.kind));
  for (const row of ranked) {
    row.special = 0;
    if (noImageName && /かえ|変え|にする/.test(data.text) && /^LooksCommand:(?:SET|NEXT|PREV)_(?:COSTUME|BACKDROP)$/.test(row.schemaId)) row.special = row.schemaId.includes(':NEXT_') ? -2 : row.schemaId.includes(':SET_') ? -1 : 0;
    if (/もどす|戻す/.test(data.text) && (/はいけい|背景/.test(data.text) && row.schemaId === 'LooksCommand:PREV_BACKDROP' || /すがた|姿/.test(data.text) && row.schemaId === 'LooksCommand:PREV_COSTUME' || /タイマー|たいまー/.test(data.text) && row.schemaId === 'TimerReset')) row.special = -3;
    const otherStop = data.names.some(n => n.kind === 'part' && project.components.some(c => c.name === n.name && c.id !== ctx.targetId)) && /止まる|止める|とまる|とめる/.test(data.text);
    if (otherStop && row.schemaId === 'StopCommand:OTHERS' || /ほかの動き|他の動き/.test(data.text) && row.schemaId === 'StopCommand:OWN_OTHERS') row.special = -4;
    if (row.schemaId === 'Break' && data.seeds.some(seed => /^(?:やめる|おわる|終わる|終える|おえる|ぬける|抜ける)$/.test(seed.text))) row.special = -4;
    if (ctx.event === 'cloneStart' && row.schemaId === 'CloneCommand:DELETE_SELF' && /^自分だけ.*消える$/.test(data.text)) row.special = -4;
  }
  const eligibleSchemas = new Set(candidates.map(h => hintSchemaId(h.id).replace(/:timed$/, '')));
  for (const row of ranked) row.allowedSchemas = eligibleSchemas;
  return ranked.filter(row => !anyVerb || row.layer < 6);
}

export function assistCompare(a: AssistRanked, b: AssistRanked, ctx: AssistContext) {
  const sharedImage = /^LooksCommand:(?:SET|NEXT|PREV)_(?:COSTUME|BACKDROP)$/;
  const group = sharedImage.test(a.schemaId) && sharedImage.test(b.schemaId) && a.schemaId.split('_').at(-1) === b.schemaId.split('_').at(-1);
  return a.layer - b.layer || Number(!!b.named) - Number(!!a.named) || (a.special === -4 ? -1 : 0) - (b.special === -4 ? -1 : 0) || a.rank - b.rank || Number(a.fragment) - Number(b.fragment) || (group ? (a.special || 0) - (b.special || 0) : 0) || (b.wordCount || 0) - (a.wordCount || 0) || Number(b.exact) - Number(a.exact) || (b.matchLength || 0) - (a.matchLength || 0) || b.filled - a.filled || Number(b.inText) - Number(a.inText) || (a.special || 0) - (b.special || 0) || (ctx.level === 'basic' ? (Number(BASIC_BLOCK_SCHEMA_IDS.has(b.schemaId)) - Number(BASIC_BLOCK_SCHEMA_IDS.has(a.schemaId))) : 0) || a.order - b.order || a.text.length - b.text.length || a.schemaId.localeCompare(b.schemaId);
}

// ── Stage 1–3: Structural Skeleton Decomposition & Synthesis ───────────────

function assistIndentBlock(body: string): string {
  return body.split('\n').map(line => '  ' + line).join('\n');
}

function assistBudgetedCanonical(text: string, ctx: AssistContext, state: AssistRunState): ReturnType<typeof assistCanonical> {
  if (state.parsesRemaining <= 0) return null;
  state.parsesRemaining--;
  return assistCanonical(text, ctx);
}

// Split a compound action phrase into up to ASSIST_MAX_CLAUSES leaf phrases.
function assistSplitActionClauses(text: string, project: Project): string[] {
  const trimmed = text.trim().replace(/[。、]+$/, '');
  if (!trimmed) return [];
  // Keep named-argument procedure calls intact (e.g., 長さを50にして四角をかく).
  for (const act of project.actions || []) {
    if (!act.name || !act.args?.length) continue;
    const qAct = assistEscapeRegex(act.name);
    if (new RegExp('(?:にして|として|で)、?' + qAct + '(?:する|を行う)?$').test(trimmed)) return [trimmed];
  }
  // Split on explicit wait-then connector (e.g., スペースキーがおされるまでまってからジャンプする).
  const waitThen = /^(.+?(?:まで|秒)(?:待って|まって))から、?(.+)$/.exec(trimmed);
  if (waitThen) return [waitThen[1], ...assistSplitActionClauses(waitThen[2], project)].slice(0, ASSIST_MAX_CLAUSES);
  const seeds = assistSeeds(trimmed, null, {});
  const parts = seeds.clauses.map(c => c.text.trim()).filter(Boolean);
  if (parts.length > 1 && parts.length <= ASSIST_MAX_CLAUSES) return parts;
  // Also split on explicit sequential connectors when clause segmentation missed them.
  const byConn = trimmed.split(/(?:それから|そして|つぎに|次に|そのあとで?、?|その後で?、?)/).map(s => s.trim().replace(/^[、。]+|[、。]+$/g, '')).filter(Boolean);
  if (byConn.length > 1 && byConn.length <= ASSIST_MAX_CLAUSES) return byConn;
  return [trimmed];
}

// Synthesize a single leaf clause, honoring registered procedures, costumes/backdrops, relative scale,
// Scratch signed deltas, and single-variable anaphora to UI display parts.
function assistResolveLeaf(
  rawClause: string,
  project: Project,
  basis: string,
  range: AssistRange,
  ctx: AssistContext,
  state: AssistRunState,
  prevUpdatedVar: string | null,
  keepOwnerActor = false
): { text: string; schemaId?: string; updatedVar?: string | null; defaultNumericSlots?: boolean } | null {
  let clause = rawClause.trim().replace(/[。、]+$/, '');
  if (!clause) return null;
  // Normalize 前に10歩ずつ進む -> 前に10歩進む inside a repeated or simple motion clause.
  clause = clause.replace(/(\d+(?:\.\d+)?(?:歩|ほ|ぽ|度|ど))ずつ(?=(?:進|すす|動|うご|回|まわ|曲|まが))/, '$1');
  // Normalize まって/待って at the end of a wait clause -> 待つ.
  if (/(?:まで|秒)(?:待って|まって)$/.test(clause)) clause = clause.replace(/(?:待って|まって)$/, '待つ');

  // Handle owner-prefixed single action (e.g., ねこを1回ジャンプさせる / ねこを右に動かす).
  const owner = project.components.find(c => c.id === ctx.targetId)?.name || null;
  let explicitActorPrefix = '';
  for (const c of [...project.components].sort((a, b) => b.name.length - a.name.length)) {
    const q = assistEscapeRegex(c.name);
    const mActor = new RegExp('^「?' + q + '」?(?:を|に)(?:1回)?(.+?)(?:させる|させて|せる|せて)$').exec(clause);
    if (mActor) {
      if (c.name !== owner || keepOwnerActor) explicitActorPrefix = c.name + 'は';
      clause = mActor[1].trim();
      break;
    }
  }
  const withActor = (src: string) => {
    if (!explicitActorPrefix || src.startsWith(explicitActorPrefix)) return src;
    return explicitActorPrefix + src;
  };

  // 1. Registered procedure with explicit argument assignment: 長さを50にして四角をかく.
  for (const act of [...(project.actions || [])].sort((a, b) => b.name.length - a.name.length)) {
    if (!act.name) continue;
    const qAct = assistEscapeRegex(act.name);
    if (new RegExp('^「?' + qAct + '」?(?:する|して|を行う|を実行する|をやる)?$').test(clause)) {
      const call = withActor('【' + act.name + '】という手順を行う。');
      const canon = assistBudgetedCanonical(call, ctx, state);
      if (canon) return { text: canon.text, schemaId: 'UserActionCall', updatedVar: null };
    }
    if (act.args?.length) {
      const mArg = new RegExp('^(.+?)(?:にして|として|で)、?「?' + qAct + '」?(?:する|して|を行う)?$').exec(clause);
      if (mArg) {
        const argParts = assistSplit(mArg[1], '、');
        const pairs: string[] = [];
        let matchedAny = false;
        for (const p of argParts) {
          const kv = /^([^を、]+)を(.+)$/.exec(p.text.trim());
          if (kv && act.args.includes(kv[1].trim())) {
            pairs.push(nameSource(kv[1].trim()) + 'を' + kv[2].trim());
            matchedAny = true;
          }
        }
        if (matchedAny && pairs.length === act.args.length) {
          const call = withActor(pairs.join('、') + 'として、【' + act.name + '】という手順を行う。');
          const canon = assistBudgetedCanonical(call, ctx, state);
          if (canon) return { text: canon.text, schemaId: 'UserActionCall', updatedVar: null };
        }
      }
    }
  }

  // 2. Relative scale and volume changes (strictly separated from absolute SET_SCALE / SET_VOLUME).
  {
    const relNum = /^大きさを(-?\d+(?:\.\d+)?)(?:％|%|パーセント)?(?:ずつ)?(大きく|小さく|ふやす|ふやして|増やす|増やして|へらす|へらして|減らす|減らして|変える|かえる)(?:する|して)?$/.exec(clause);
    if (relNum) {
      const rawN = Number(relNum[1]);
      const negWord = /小さく|へら|減ら/.test(relNum[2]);
      const isSub = negWord !== (rawN < 0);
      const src = withActor('大きさを（大きさ' + (isSub ? '－' : '＋') + Math.abs(rawN) + '）％にする。');
      const canon = assistBudgetedCanonical(src, ctx, state);
      if (canon) return { text: canon.text, schemaId: 'LooksCommand:SET_SCALE', updatedVar: null };
    }
    const relVol = /^(?:音の大きさ|音量)を(-?\d+(?:\.\d+)?)(?:％|%|パーセント)?(?:ずつ)?(大きく|小さく|ふやす|ふやして|増やす|増やして|へらす|へらして|減らす|減らして|上げ|あげ|下げ|さげ|変える|かえる)(?:する|して|る)?$/.exec(clause);
    if (relVol) {
      const rawN = Number(relVol[1]);
      const negWord = /小さく|へら|減ら|下げ|さげ/.test(relVol[2]);
      const isSub = negWord !== (rawN < 0);
      const src = withActor('音の大きさを（音の大きさ' + (isSub ? '－' : '＋') + Math.abs(rawN) + '）％にする。');
      const canon = assistBudgetedCanonical(src, ctx, state);
      if (canon) return { text: canon.text, schemaId: 'SoundCommand:SET_VOLUME', updatedVar: null };
    }
  }

  // 3. Registered costume or backdrop direct switch (e.g. 走るすがたにかえる).
  {
    const ownerComp = project.components.find(c => c.id === ctx.targetId);
    for (const cos of [...(ownerComp?.costumes || [])].sort((a, b) => b.name.length - a.name.length)) {
      if (!cos.name) continue;
      const q = assistEscapeRegex(cos.name);
      if (new RegExp('^(?:すがたを|見た目を)?「?' + q + '」?(?:にかえる|に変える|にする|になる|にかえて|に変えて)$').test(clause)) {
        const src = withActor('すがたを「' + cos.name + '」にかえる。');
        const canon = assistBudgetedCanonical(src, ctx, state);
        if (canon) return { text: canon.text, schemaId: 'LooksCommand:SET_COSTUME', updatedVar: null };
      }
    }
    for (const bg of [...(project.stage?.backdrops || [])].sort((a, b) => b.name.length - a.name.length)) {
      if (!bg.name) continue;
      const q = assistEscapeRegex(bg.name);
      if (new RegExp('^(?:はいけいを|背景を)?「?' + q + '」?(?:にかえる|に変える|にする|になる|にかえて|に変えて)$').test(clause)) {
        const src = 'はいけいを「' + bg.name + '」にかえる。';
        const canon = assistBudgetedCanonical(src, ctx, state);
        if (canon) return { text: canon.text, schemaId: 'LooksCommand:SET_BACKDROP', updatedVar: null };
      }
    }
  }

  // 4. Limited anaphora: previous clause updated a single registered variable, current clause displays it on a UI part.
  if (prevUpdatedVar) {
    const uiParts = project.components.filter(c => ['label', 'button', 'box', 'input'].includes(c.type)).sort((a, b) => b.name.length - a.name.length);
    const uiTail = /」?(?:に|へ|の文字を|の中身を)(?:出す|だす|表示する|ひょうじする|見せる|みせる|書く|かく|入れる|いれる|うつす|かえる|変える)$/.source;
    for (const part of uiParts) {
      const q = assistEscapeRegex(part.name);
      if (new RegExp('^「?' + q + uiTail).test(clause)) {
        const src = part.type === 'input'
          ? '「' + part.name + '」の中身を' + nameSource(prevUpdatedVar) + 'にする。'
          : '「' + part.name + '」の文字を' + nameSource(prevUpdatedVar) + 'にかえる。';
        const canon = assistBudgetedCanonical(src, ctx, state);
        if (canon) return { text: canon.text, schemaId: part.type === 'input' ? 'LooksCommand:SET_INPUT' : 'LooksCommand:SET_TARGET_TEXT', updatedVar: null };
      }
    }
  }

  // 5. Edge bounce phrasing inside compound clauses (画面のはしで跳ね返る).
  if (/^(?:画面の)?(?:はし|端|かべ|壁)(?:で|にふれたら|に当たったら|にぶつかったら)?(?:はね返|跳ね返|はねかえ|跳ねかえ)(?:る|って)?$/.test(clause)) {
    const src = withActor('画面の端' + 'にふれ' + 'ていれば、はね返る。');
    const canon = assistBudgetedCanonical(src, ctx, state);
    if (canon) return { text: canon.text, schemaId: 'MotionCommand:BOUNCE', updatedVar: null };
  }

  // 6. Try direct canonical parse of clause forms.
  const extractUpdatedVar = (canon: NonNullable<ReturnType<typeof assistCanonical>>): string | null => {
    const n = canon.ast.body?.[0];
    if (n && (n.kind === 'Assignment' || n.kind === 'NumericUpdate') && n.target?.name) return n.target.name;
    return null;
  };
  for (const form of assistClauseForms(clause)) {
    const canon = assistBudgetedCanonical(withActor(form), ctx, state);
    if (canon && !canon.ast.heading && canon.ast.body?.[0]?.kind !== 'IfStatement') {
      return { text: canon.text, schemaId: syntaxSchema(canon.ast.body?.[0])?.id || canon.ast.body?.[0]?.kind, updatedVar: extractUpdatedVar(canon) };
    }
  }

  // 7. Fall back to assistSearch for this leaf clause.
  const leafSeeds = assistSeeds(clause, ctx.symbols, ctx);
  const searched = assistSearch(project, basis, range, ctx, leafSeeds, state)
    .filter(c => c.layer < 6)
    .sort((a, b) => /^音を出/.test(clause) ? Number(b.schemaId === 'SoundCommand:SAMPLE_WAIT') - Number(a.schemaId === 'SoundCommand:SAMPLE_WAIT') || assistCompare(a, b, ctx) : assistCompare(a, b, ctx));
  const best = searched[0];
  if (!best) return null;
  const src = withActor(best.text);
  const canon = assistBudgetedCanonical(src, ctx, state);
  return {
    text: canon ? canon.text : src,
    schemaId: best.schemaId,
    updatedVar: canon ? extractUpdatedVar(canon) : null,
    defaultNumericSlots: best.defaultNumericSlots,
  };
}

// Normalize a condition fragment into a canonical condition prefix for if / while / until.
function assistCanonicalCondition(rawCond: string, mode: 'if' | 'while' | 'until', ctx: AssistContext, state: AssistRunState): string[] {
  const clean = rawCond.trim().replace(/[、。]+$/, '').replace(/^もし、?/, '');
  if (!clean) return [];
  const results: string[] = [];
  const pushUnique = (s: string) => { if (s && !results.includes(s)) results.push(s); };

  // Check arithmetic/empty word conditions first (decision 2: 10の倍数, 12の約数, からっぽ).
  const wordCondEnd = /(?:なら|だったら|でなければ|でないなら|ではないなら|じゃないなら|のあいだ|であるあいだ|あいだ|になるまで)?$/.source;
  const wordMatch = new RegExp('^(.+?)が(' + MEIJIN_WORD + ')' + wordCondEnd).exec(clean);
  if (wordMatch) {
    const subj = wordMatch[1];
    const word = meijinWordSpelling(wordMatch[2]);
    const isNeg = /(?:でなければ|でないなら|ではないなら|じゃないなら)$/.test(clean);
    const ending = mode === 'while' ? 'である' + 'あいだ' : mode === 'until' ? 'になるまで' : isNeg ? 'でなければ' : 'なら';
    try {
      const check = meijinWordCheck(subj, word);
      if (check.same) {
        pushUnique((mode === 'while' ? check.same : check.same.replace(/と同じ$/, '')) + ending);
      } else if (/の倍数$/.test(word) && !isNeg) {
        const val = word.slice(0, -3);
        const last = subj + '÷' + val + 'のあまりが0' + (mode === 'while' ? 'と同じ' : '') + ending;
        pushUnique(subj + 'が0とちがっていて、' + last);
        pushUnique(last);
      } else {
        pushUnique(meijinWordTest(subj, word, isNeg ? 'でなければ' : ending));
      }
    } catch {}
  }

  const probes: string[] = [clean];
  if (mode === 'if') {
    if (!/(?:なら|れば)$/.test(clean)) {
      probes.push(clean.replace(/(?:たら|だら|とき|たとき)$/, 'なら'));
      probes.push(clean.replace(/ふれたら$/, 'ふれていれば'));
      probes.push(clean.replace(/さわったら$/, 'ふれていれば'));
      probes.push(clean.replace(/おしたら$/, 'おされていれば'));
      probes.push(clean.replace(/おされたら$/, 'おされていれば'));
      probes.push(clean.replace(/になったら$/, 'なら'));
      probes.push(clean.replace(/であれば$/, 'なら'));
      probes.push(clean + 'なら');
    }
  } else if (mode === 'while') {
    probes.push(clean.replace(/(?:あいだ|間)(?:は|じゅう)?$/, 'あいだ'));
    probes.push(clean.replace(/おしている(?:あいだ|間)?(?:は|じゅう)?$/, () => 'おされ' + 'ている' + 'あいだ'));
    if (!/あいだ$/.test(clean)) probes.push(clean + 'あいだ');
  } else if (mode === 'until') {
    probes.push(clean.replace(/まで$/, 'まで'));
    if (!/まで$/.test(clean)) probes.push(clean + 'まで');
  }

  for (const probe of [...new Set(probes)]) {
    if (state.parsesRemaining <= 0) break;
    const wrapped = mode === 'if' ? 'もし' + probe + '、\n  何もしない。' : probe + '、くり返す。\n  何もしない。';
    const canon = assistBudgetedCanonical(wrapped, ctx, state);
    if (canon) {
      const head = canon.text.split('\n')[0];
      if (mode === 'if') pushUnique(head.replace(/^もし/, '').replace(/、$/, ''));
      else pushUnique(head.replace(/、くり返す。$/, ''));
    }
  }
  return results;
}

// Parse one normalized stream into candidate AssistSkeleton trees (bounded by ASSIST_MAX_DEPTH and ASSIST_MAX_SKELETONS).
function assistBuildSkeletons(text: string, rawOriginal: string, project: Project, ctx: AssistContext, range: AssistRange, basis: string, depth: number): AssistSkeleton[] {
  if (depth > ASSIST_MAX_DEPTH) return [{ skeletonTag: 'LeafClause', raw: text }];
  const out: AssistSkeleton[] = [];
  const push = (sk: AssistSkeleton) => { if (out.length < ASSIST_MAX_SKELETONS) out.push(sk); };
  const trimmed = text.trim().replace(/[。]+$/, '');
  if (!trimmed) return out;

  // 0. Same-line anaphora across two sentences: "10歩進んでから右に90度曲がる。この二つを4回くり返す。"
  if (depth === 0) {
    const rawLine = basis.slice(range.lineStart + range.indent, range.lineEnd).trim();
    const normLine = assistNumberText(rawLine);
    const mAnaphora = /^(.+?)。\s*(?:この(?:二つ|2つ|ふたつ|三つ|3つ|みっつ|全部|ぜんぶ|すべて|まとまり)|これら|これ)を(?:、?書いた順に)?(\d+)回(?:くり返す|くり返します|繰り返す|くりかえす)。?$/.exec(normLine);
    if (mAnaphora) {
      const count = Number(mAnaphora[2]);
      if (count >= 1) {
        const bodyClauses = assistSplitActionClauses(mAnaphora[1], project);
        const bodySk: AssistSkeleton = bodyClauses.length > 1
          ? { skeletonTag: 'SequenceWrap', children: bodyClauses.map(c => ({ skeletonTag: 'LeafClause', raw: c })) }
          : { skeletonTag: 'LeafClause', raw: mAnaphora[1] };
        push({ skeletonTag: 'RepeatCountWrap', count, body: bodySk, spanStart: range.lineStart + range.indent, spanEnd: range.lineEnd });
      }
    }
  }

  // 1. ForEachWrap (captured BEFORE 1番目 list-mutation rules): 持ち物を1番目から順に2秒ずつ言う
  for (const list of [...(project.projectData?.lists || []), ...(project.components.find(c => c.id === ctx.targetId)?.localData?.lists || [])]) {
    if (!list.name) continue;
    const q = assistEscapeRegex(list.name);
    const mEach = new RegExp('^' + q + '(?:の中身)?を(?:(?:1|一|いち)番目から|先頭から|最初から|はじめから)?(?:全部)?(?:(?:1|一)つずつ)?(?:順に|順番に|じゅんに|じゅんばんに)?(?:(\\d+(?:\\.\\d+)?)秒ずつ)?(?:言う|いう|話す|はなす)$').exec(trimmed);
    if (mEach && /(?:1|一|いち)番目から|先頭から|最初から|はじめから|順に|順番に|一つずつ|1つずつ|全部/.test(trimmed)) {
      push({ skeletonTag: 'ForEachWrap', listName: list.name, seconds: Number(mEach[1] || 1) });
    }
  }

  // 2. HeadingWrap (heading + body on one line): スペースキーをおすたびに、ねこを1回ジャンプさせる
  if (depth === 0 && !ctx.definitionKind && ctx.targetId !== 'stage' && range.indent === 0) {
    const mKeyHead = /^「([^「」]+)」キー(?:をおすたびに|を押すたびに|がおされたとき|が押されたとき|をおしたとき|を押したとき)、?(.+)$/.exec(trimmed);
    if (mKeyHead && mKeyHead[2].trim()) {
      const bodyRaw = mKeyHead[2].trim();
      const bodyClauses = assistSplitActionClauses(bodyRaw, project);
      const bodySk: AssistSkeleton = bodyClauses.length > 1
        ? { skeletonTag: 'SequenceWrap', children: bodyClauses.map(c => ({ skeletonTag: 'LeafClause', raw: c })) }
        : { skeletonTag: 'LeafClause', raw: bodyRaw };
      push({ skeletonTag: 'HeadingWrap', headerText: '「' + mKeyHead[1] + '」キーを' + 'おすたびに、', body: bodySk });
    }
  }

  // 3. RepeatCountWrap: 〜のを4回くり返す / ジャンプを3回する
  {
    const mRepBlock = /^(.+?)(?:のを|ことを)、?(\d+)回(?:くり返す|くり返します|繰り返す|くりかえす)$/.exec(trimmed);
    if (mRepBlock) {
      const inner = mRepBlock[1].trim().replace(/^[「『]|[」』]$/g, '');
      const count = Number(mRepBlock[2]);
      const bodyClauses = assistSplitActionClauses(inner, project);
      const bodySk: AssistSkeleton = bodyClauses.length > 1
        ? { skeletonTag: 'SequenceWrap', children: bodyClauses.map(c => ({ skeletonTag: 'LeafClause', raw: c })) }
        : { skeletonTag: 'LeafClause', raw: inner };
      push({ skeletonTag: 'RepeatCountWrap', count, body: bodySk });
    }
    const mRepAction = /^(.+?)を(\d+)回(?:する|行う|実行する|やる)$/.exec(trimmed);
    if (mRepAction && !/くり返|繰返|くりかえ/.test(mRepAction[1])) {
      const inner = mRepAction[1].trim();
      const count = Number(mRepAction[2]);
      const bodyClauses = assistSplitActionClauses(inner, project);
      const bodySk: AssistSkeleton = bodyClauses.length > 1
        ? { skeletonTag: 'SequenceWrap', children: bodyClauses.map(c => ({ skeletonTag: 'LeafClause', raw: c })) }
        : { skeletonTag: 'LeafClause', raw: inner };
      push({ skeletonTag: 'RepeatCountWrap', count, body: bodySk });
    }
  }

  // 4. ForeverWrap (multi-clause preservation): ずっと前に10歩進んで画面のはしで跳ね返る
  if (ctx.definitionKind !== 'function') {
    const mForever = /^(?:ずっと|ずーっと|くり返し(?!を(?:やめる|ぬける|抜ける|終える|おえる|止める|とめる)))、?(.+)$/.exec(trimmed);
    if (mForever && !/(?:まで|あいだ|間|なら|たら|れば|ごとに|たびに|\d+回|くり返|繰返|くりかえ)/.test(mForever[1])) {
      const bodyClauses = assistSplitActionClauses(mForever[1], project);
      if (bodyClauses.length >= 2) {
        const bodySk: AssistSkeleton = { skeletonTag: 'SequenceWrap', children: bodyClauses.map(c => ({ skeletonTag: 'LeafClause', raw: c })) };
        push({ skeletonTag: 'ForeverWrap', body: bodySk });
      }
    }
  }

  // 5. RepeatUntilWrap (decision 1: 〜まで＋動作): 星にふれるまで右に動く / 点数が10になるまで右に動く
  if (ctx.definitionKind !== 'function') {
    const condEnds = assistConditionEnds(trimmed, project);
    for (const endAt of condEnds) {
      if (trimmed.slice(endAt - 2, endAt) !== 'まで') continue;
      const afterRaw = trimmed.slice(endAt);
      const explicitComma = /^、/.test(afterRaw);
      const bodyRaw = afterRaw.replace(/^[、\s]+/, '');
      if (!bodyRaw || /^(?:ずっと)?(?:待|ま[つちっ]|止ま|とま|くり返|繰返|くりかえ|ループ|リピート|つづけ|続け)/.test(bodyRaw)) continue;
      const bodyClauses = assistSplitActionClauses(bodyRaw, project);
      const bodySk: AssistSkeleton = bodyClauses.length > 1
        ? { skeletonTag: 'SequenceWrap', children: bodyClauses.map(c => ({ skeletonTag: 'LeafClause', raw: c })) }
        : { skeletonTag: 'LeafClause', raw: bodyRaw };
      push({ skeletonTag: 'RepeatUntilWrap', conditionText: trimmed.slice(0, endAt), body: bodySk, explicitComma });
    }
  }

  // 6. WhileOrContinuousWrap: 右の矢印キーをおしている間は、右に動く
  // Leave explicit continuous-motion phrasings (動き続ける/速さ/毎秒/歩) to the existing ContinuousRule path.
  {
    const mKeyHold = /^(「[^「」]+」キー)(?:をおしている|を押している|がおされている|が押されている)(?:あいだ|間)(?:は|じゅう)?、?(.+)$/.exec(trimmed);
    if (mKeyHold && !/^(?:くり返|繰返|くりかえ)/.test(mKeyHold[2].trim()) && !/(?:動き続け|うごきつづけ|進み続け|速さ|毎秒|\d+(?:\.\d+)?歩)/.test(mKeyHold[2])) {
      const bodyRaw = mKeyHold[2].trim();
      const speedMatch = /(\d+(?:\.\d+)?)秒に(\d+(?:\.\d+)?)歩/.exec(bodyRaw);
      const dirMatch = /(右|左|上|下|前|後ろ|うしろ)/.exec(bodyRaw);
      const bodyClauses = assistSplitActionClauses(bodyRaw, project);
      const bodySk: AssistSkeleton = bodyClauses.length > 1
        ? { skeletonTag: 'SequenceWrap', children: bodyClauses.map(c => ({ skeletonTag: 'LeafClause', raw: c })) }
        : { skeletonTag: 'LeafClause', raw: bodyRaw };
      push({
        skeletonTag: 'WhileOrContinuousWrap',
        conditionText: mKeyHold[1] + 'がおされ' + 'ている' + 'あいだ',
        body: bodySk,
        isKeyHold: true,
        speedSec: speedMatch ? Number(speedMatch[1]) : 1,
        speedSteps: speedMatch ? Number(speedMatch[2]) : 10,
        directionWord: dirMatch ? dirMatch[1] : undefined,
      });
    } else if (!mKeyHold) {
      const mWhile = /^(.+?)(?:あいだ|間)(?:は|じゅう)?、?(.+)$/.exec(trimmed);
      if (mWhile && !/^(?:くり返|繰返|くりかえ|待つ|まつ)/.test(mWhile[2].trim()) && !/^\d+(?:\.\d+)?秒の?$/.test(mWhile[1])) {
        const bodyRaw = mWhile[2].trim();
        const bodyClauses = assistSplitActionClauses(bodyRaw, project);
        const bodySk: AssistSkeleton = bodyClauses.length > 1
          ? { skeletonTag: 'SequenceWrap', children: bodyClauses.map(c => ({ skeletonTag: 'LeafClause', raw: c })) }
          : { skeletonTag: 'LeafClause', raw: bodyRaw };
        push({ skeletonTag: 'WhileOrContinuousWrap', conditionText: mWhile[1] + 'あいだ', body: bodySk });
      }
    }
  }

  // 7. IfWrap (with optional comma, negation, arithmetic/empty words, comparison variants):
  {
    const nonCapMeijinWord = MEIJIN_WORD.replace(/^\(/, '(?:');
    const ifWordEnd = /(?:なら|だったら|でなければ|でないなら|ではないなら|じゃないなら)/.source;
    const ifWordBody = /(?:、(.*)|([^、].*))?$/.source;
    const mWordIf = new RegExp('^(?:もし、?)?(.+?が(?:' + nonCapMeijinWord + ')' + ifWordEnd + ')' + ifWordBody).exec(trimmed);
    if (mWordIf) {
      const bodyRaw = (mWordIf[2] ?? mWordIf[3] ?? '').trim();
      const bodyClauses = bodyRaw ? assistSplitActionClauses(bodyRaw, project) : [];
      const bodySk: AssistSkeleton | null = !bodyRaw ? null
        : bodyClauses.length > 1 ? { skeletonTag: 'SequenceWrap', children: bodyClauses.map(c => ({ skeletonTag: 'LeafClause', raw: c })) }
          : { skeletonTag: 'LeafClause', raw: bodyRaw };
      push({ skeletonTag: 'IfWrap', conditionText: mWordIf[1], body: bodySk });
    } else if (/^もし/.test(trimmed) || /(?:未満|より少ない|より少なかったら|より多い|より多かったら|をこえたら|と同じなら|いなかったら|いなければ|がなければ|がなかったら|がないなら|でなければ|じゃなければ|じゃなかったら|倍数|約数|偶数|奇数|素数|割り切|からっぽ|空っぽ)/.test(rawOriginal)) {
      const condEnds = assistConditionEnds(trimmed, project);
      for (const endAt of condEnds) {
        const condSlice = trimmed.slice(0, endAt);
        if (/まで$|あいだ$|間$|とき$|時$/.test(condSlice) && !/^もし/.test(trimmed)) continue;
        if (/まで$|あいだ$|間$/.test(condSlice)) continue;
        const bodyRaw = trimmed.slice(endAt).replace(/^[、\s]+/, '');
        if (!bodyRaw) continue;
        const bodyClauses = assistSplitActionClauses(bodyRaw, project);
        const bodySk: AssistSkeleton = bodyClauses.length > 1
          ? { skeletonTag: 'SequenceWrap', children: bodyClauses.map(c => ({ skeletonTag: 'LeafClause', raw: c })) }
          : { skeletonTag: 'LeafClause', raw: bodyRaw };
        push({ skeletonTag: 'IfWrap', conditionText: condSlice, body: bodySk });
      }
    }
  }

  // 8. SequenceWrap (top-level multi-clause or single-clause leaf with relative/anaphora/action-arg support).
  if (depth === 0) {
    const isSingleCompound = /(?:たずね|聞[くいき]|き[くい]|質問|しつもん|言って|といい).*(?:答え|こたえ|返事|知ら|しら|伝え|つたえ)/.test(trimmed) ||
      /(?:合図|あいず|知らせ|しらせ|とばして|をわたして|として、?|という(?:手順|てじゅん))/.test(trimmed);
    const directSingle = /^いまのばしょから、/.test(trimmed) || isSingleCompound;
    const clauses = directSingle ? [trimmed] : assistSplitActionClauses(trimmed, project);
    const firstIsBarePart = clauses.length > 1 && project.components.some(c => c.name === clauses[0]);
    const firstIsCondition = clauses.length > 1 && /(?:たら|だら|なら|[えけげせてねべめれ]ば|まで|あいだ|間)$/.test(clauses[0]);
    if (clauses.length > 1 && clauses.length <= 3 && !firstIsBarePart && !firstIsCondition) {
      push({ skeletonTag: 'SequenceWrap', children: clauses.map(c => ({ skeletonTag: 'LeafClause', raw: c })) });
    } else if (clauses.length <= 1) {
      push({ skeletonTag: 'LeafClause', raw: trimmed });
    }
  }

  return out;
}

function assistRenderSkeleton(
  sk: AssistSkeleton,
  project: Project,
  basis: string,
  range: AssistRange,
  ctx: AssistContext,
  state: AssistRunState,
  existingBody: boolean
): AssistSource[] {
  const renderBody = (bodySk: AssistSkeleton): string | null => {
    if (bodySk.skeletonTag === 'LeafClause') {
      const leaf = assistResolveLeaf(bodySk.raw, project, basis, range, ctx, state, null);
      if (!leaf || leaf.defaultNumericSlots && /\d+Hz/.test(leaf.text)) return null;
      return leaf.text;
    }
    if (bodySk.skeletonTag === 'SequenceWrap') {
      const lines: string[] = [];
      let prevVar: string | null = null;
      const otherNamed = bodySk.children.some(ch => ch.skeletonTag === 'LeafClause' && project.components.some(c => c.id !== ctx.targetId && ch.raw.includes(c.name)));
      const repeatableMotions = new Set(['MotionCommand:MOVE', 'MotionCommand:MOVE_BY', 'MotionCommand:TURN_RIGHT', 'MotionCommand:TURN_LEFT']);
      for (const child of bodySk.children) {
        if (child.skeletonTag !== 'LeafClause') return null;
        const leaf = assistResolveLeaf(child.raw, project, basis, range, ctx, state, prevVar, otherNamed);
        if (!leaf || leaf.defaultNumericSlots) return null;
        if (lines.at(-1) === leaf.text && !repeatableMotions.has(leaf.schemaId || '')) return null;
        lines.push(leaf.text);
        prevVar = leaf.updatedVar ?? null;
      }
      return lines.length === bodySk.children.length ? lines.join('\n') : null;
    }
    return null;
  };

  switch (sk.skeletonTag) {
    case 'ForEachWrap': {
      if (ctx.definitionKind === 'function') return [];
      const text = sk.listName + 'の中身を先頭から一つずつ見て、次のことを行う。\n  この中では、今見て' + 'いるものを【これ】とよぶ。\n  これを' + sk.seconds + '秒話す。';
      return [{ text, schemaId: 'ForEach' }];
    }
    case 'HeadingWrap': {
      const bodyText = renderBody(sk.body);
      if (!bodyText) return [];
      return [{ text: sk.headerText + '\n' + assistIndentBlock(bodyText), schemaId: 'Heading:keyDown' }];
    }
    case 'RepeatCountWrap': {
      const bodyText = renderBody(sk.body);
      if (!bodyText) return [];
      const text = sk.count + '回くり返す。\n' + assistIndentBlock(bodyText);
      const span = sk.spanStart !== undefined && sk.spanEnd !== undefined ? { start: sk.spanStart, end: sk.spanEnd } : {};
      return [{ text, schemaId: 'RepeatCount', ...span }];
    }
    case 'ForeverWrap': {
      if (ctx.definitionKind === 'function') return [];
      const bodyText = renderBody(sk.body);
      if (!bodyText) return [];
      return [{ text: 'ずっとくり返す。\n' + assistIndentBlock(bodyText), schemaId: 'Forever' }];
    }
    case 'RepeatUntilWrap': {
      if (ctx.definitionKind === 'function') return [];
      const conds = assistCanonicalCondition(sk.conditionText, 'until', ctx, state);
      const bodyText = renderBody(sk.body);
      if (!conds.length || !bodyText) return [];
      const out: AssistSource[] = [];
      for (const c of conds) {
        out.push({ text: c + '、くり返す。\n' + assistIndentBlock(bodyText), schemaId: 'RepeatUntil' });
        out.push({ text: c + '待つ。\n' + bodyText, schemaId: 'WaitUntil' });
      }
      return out;
    }
    case 'WhileOrContinuousWrap': {
      const out: AssistSource[] = [];
      const conds = assistCanonicalCondition(sk.conditionText, 'while', ctx, state);
      const bodyText = renderBody(sk.body);
      if (conds.length && bodyText) {
        for (const c of conds) out.push({ text: c + '、くり返す。\n' + assistIndentBlock(bodyText), schemaId: 'RepeatWhile' });
      }
      if (sk.isKeyHold && !ctx.definitionKind && ctx.targetId !== 'stage' && range.indent === 0 && sk.directionWord) {
        const dirWord = ({ うしろ: '後ろ' } as Partial<Record<string, string>>)[sk.directionWord] || sk.directionWord;
        const cont = sk.conditionText + '、' + dirWord + 'へ' + (sk.speedSec || 1) + '秒に' + (sk.speedSteps || 10) + '歩の速さで動き続ける。';
        out.push({ text: cont, schemaId: 'ContinuousRule' });
      }
      return out;
    }
    case 'IfWrap': {
      const conds = assistCanonicalCondition(sk.conditionText, 'if', ctx, state);
      if (!conds.length) return [];
      if (!sk.body) return conds.map(c => ({ text: 'もし' + c + '、', schemaId: 'IfStatement' }));
      const bodyText = renderBody(sk.body);
      if (!bodyText) return [];
      return conds.map(c => ({ text: 'もし' + c + '、\n' + assistIndentBlock(bodyText), schemaId: 'IfStatement' }));
    }
    case 'SequenceWrap': {
      const bodyText = renderBody(sk);
      return bodyText ? [{ text: bodyText }] : [];
    }
    case 'LeafClause': {
      if (/をわたして|という(?:手順|てじゅん)/.test(sk.raw)) return [];
      const leaf = assistResolveLeaf(sk.raw, project, basis, range, ctx, state, null);
      if (!leaf) return [];
      // Only emit direct leaf synthesis for relative scale/volume, action-arg, costume/backdrop, Scratch signed deltas, or edge bounce.
      const isScratchDelta = /(?:[xXyYｘＸｙＹ]|横|よこ|縦|たて)(?:座標|ざひょう)?を-?\d+(?:\.\d+)?(?:ずつ)?(?:変える|かえる)/.test(basis.slice(range.start, range.end));
      if (/(?:大きさを（大きさ|音の大きさを（音の大きさ|すがたを「|はいけいを「|として、【|はね返る)/.test(leaf.text) || (isScratchDelta && leaf.text.startsWith('いまのばしょから、'))) {
        return [{ text: leaf.text, schemaId: leaf.schemaId }];
      }
      return [];
    }
  }
}

export function assistSkeletonSources(rawText: string, project: Project, ctx: AssistContext, basis: string, range: AssistRange, state: AssistRunState): { high: AssistSource[]; normal: AssistSource[] } {
  const nextLine = basis.slice(range.lineEnd + 1).split('\n')[0] || '';
  const existingBody = Boolean(nextLine.trim() && nextLine.match(/^\s*/)![0].length > range.indent);
  const lattice = assistNormalizeLattice(rawText, ctx.symbols, ctx);
  const high: AssistSource[] = [];
  const normal: AssistSource[] = [];
  const seen = new Set<string>();
  const highPriorityTags = new Set(['ForEachWrap', 'RepeatCountWrap', 'ForeverWrap', 'RepeatUntilWrap', 'WhileOrContinuousWrap', 'LeafClause']);
  for (const variant of lattice) {
    const skeletons = assistBuildSkeletons(variant.text, rawText, project, ctx, range, basis, 0);
    for (const sk of skeletons) {
      if (state.parsesRemaining <= 0) break;
      const isHigh = highPriorityTags.has(sk.skeletonTag) ||
        (sk.skeletonTag === 'IfWrap' && (variant.text !== rawText || /(?:倍数|約数|からっぽ|カラッポ)/.test(rawText))) ||
        (sk.skeletonTag === 'SequenceWrap' && /(?:まで(?:待って|まって)から|ふやして|増やして|へらして|減らして)/.test(rawText));
      const target = isHigh ? high : normal;
      for (const item of assistRenderSkeleton(sk, project, basis, range, ctx, state, existingBody)) {
        const key = item.text.replace(/[\s。]/g, '') + '@' + (item.start ?? range.start) + ':' + (item.end ?? range.end);
        if (!seen.has(key)) {
          seen.add(key);
          target.push(item);
        }
      }
    }
  }
  return { high, normal };
}

// ── Existing structured, signal, general transforms & compose ────────────

export function assistStructuredTransforms(text: string, data: AssistData, project: Project, ctx: AssistContext, basis: string, range: AssistRange, state?: AssistRunState): AssistSource[] {
  const sources: AssistSource[] = [];
  const add = (t: string, extra: Omit<AssistSource, 'text'> = {}) => sources.push({ text: t, ...extra });
  const indent = (body: string) => body.split('\n').map(line => '  ' + line).join('\n');
  const read = (source: string, wait = false) => {
    const forms = assistClauseForms(source);
    for (const form of forms) {
      const parsed = assistCanonical(form, ctx);
      if (parsed && !parsed.ast.heading && parsed.ast.body?.[0]?.kind !== 'IfStatement') return parsed.text;
    }
    const candidates = assistSearch(project, basis, range, ctx, assistSeeds(source, ctx.symbols, ctx), state).filter(c => c.layer < 6).sort((a, b) => assistCompare(a, b, ctx));
    if (wait) { const sample = candidates.find(c => c.schemaId === 'SoundCommand:SAMPLE_WAIT'); if (sample) return sample.text; }
    return candidates[0]?.text;
  };
  const isCondition = (source: string) => {
    for (const form of ['if', 'while', 'until', 'plain'] as const) {
      try { parseCondition(source, ctx.symbols, ctx, form); return true; } catch {}
    }
    return false;
  };
  let m: RegExpExecArray | null;
  if (ctx.event === 'cloneStart' && /^自分だけ消える$/.test(text)) {
    for (const id of ['CloneCommand:DELETE_SELF', 'LooksCommand:HIDE']) {
      const hint = hintCandidates(project, ctx.targetId, { ...ctx, source: basis, start: range.lineStart + range.indent, end: range.lineEnd }).find(h => h.id === id && h.enabled);
      if (hint) add(hint.text);
    }
  }
  if ((m = /^(\d+(?:\.\d+)?)秒のあいだ待つ$/.exec(text))) add(m[1] + '秒待つ。');
  if ((m = /^(.+?)(\d+(?:\.\d+)?秒(?:待つ|まつ))$/.exec(text)) && /[うくぐすつぬぶむるみ]$|(?:たあと|だあと)$/.test(m[1])) {
    const before = read(m[1].replace(/あと$/, ''));
    const after = read(m[2]);
    if (before && after) add(before + '\n' + after);
  }
  if (/とばして(?:次|つぎ)へ$/.test(text)) {
    const hint = hintCandidates(project, ctx.targetId, { ...ctx, source: basis, start: range.lineStart + range.indent, end: range.lineEnd }).find(h => h.id === 'Continue' && h.enabled);
    if (hint) add(hint.text);
  }
  const own = project.components.find(c => c.id === ctx.targetId)?.name;
  if (own && new RegExp('^(?:自分|' + assistEscapeRegex(own) + ')(?:の動きを|を)?(?:全部|だけ)?(?:止まる|止める|とまる|とめる)$').test(text)) {
    add('自分のほかの動きを止める。\nこの動きを止める。');
    add('この動きを止める。');
  }
  if ((m = /^(\d+(?:\.\d+)?)秒に(\d+(?:\.\d+)?)歩の速さで、?(.+)$/.exec(text)) && !/続ける|つづける/.test(m[3])) {
    const motion = searchIntent(m[3], ctx);
    const direction = ({ right: '右', left: '左', up: '上', down: '下' } as Partial<Record<string, string>>)[motion?.direction as string];
    if (direction) add(m[1] + '秒かけて、いまのばしょから、' + direction + 'へ' + m[2] + '歩動く。');
    else if (motion?.direction === 'forward') add('前へ' + m[2] + '歩進む。\n' + m[1] + '秒待つ。');
  }
  for (const list of project.projectData?.lists || []) {
    const q = assistEscapeRegex(list.name);
    if ((m = new RegExp('^' + q + '(?:の中身)?を(?:全部)?(?:(?:一|1)つずつ)?(?:順に|順番に)?(?:(\\d+(?:\\.\\d+)?)秒ずつ)?(?:言う|話す)$').exec(text)) && /順|(?:一|1)つずつ|全部/.test(text)) {
      const hint = hintCandidates(project, ctx.targetId, { ...ctx, source: basis, start: range.lineStart + range.indent, end: range.lineEnd }).find(h => h.id === 'each:' + list.name && h.enabled);
      if (hint) {
        const parsed = assistCanonical(hint.text, ctx);
        const node = parsed?.ast?.body?.[0];
        const say = node?.body?.find(n => n.kind === 'Say');
        if (say) { say.seconds = sentenceQuantity({ kind: 'NumberLiteral', value: Number(m[1] || 1) }, '秒'); add(formatScript(parsed!.ast)); }
      }
    }
  }
  if (data.subject && /^\d+回/.test(text)) add(data.subject + 'が' + text);
  add(text.replace(/を答えにして返す$/, 'を答えとして返す'));
  add(text.replace(/を(.+?)で、(?=【[^【】]+】という(?:手順|てじゅん)を行う)/, 'を$1として、'));
  if ((m = /^([^、]+)と([^、]+)をわたして、(.+)$/.exec(text))) add('（' + m[1] + '、' + m[2] + '）をわたして、' + m[3]);
  if (/という(?:手順|てじゅん)をずっと行う$/.test(text)) {
    const body = read(text.replace('をずっと行う', 'を行う'));
    if (body) add('ずっとくり返す。\n' + indent(body));
  }
  if (/^(?:「[^「」]+」|[^「」、]+)が.*(?:以上|以下|より|同じ)/.test(text) && !/なら|あいだ|まで|たら|とき/.test(text) && /待つ$/.test(text)) {
    add(text.replace(/(以上で|以下で)(?!、)/g, '$1、').replace(/キーがおされるまで待つ$/, 'キーがおされている状態になるまで待つ'));
  }
  if (/^(?:それ以外(?:は|のとき)?|それいがい(?:は|のとき)?|そうでないと|でないと|ほかは|もしそうでなければ|じゃなければ)$/.test(text)) {
    add(basis.slice(0, range.start) + 'そうでなければ、' + basis.slice(range.end), { schemaId: 'IfStatement', start: 0, end: basis.length, whole: true });
  }
  if ((m = /^(もし.+?、)(もし.+)$/.exec(text))) {
    add(basis.slice(0, range.start) + m[1] + '\n  ' + m[2] + basis.slice(range.end), { schemaId: 'IfStatement', start: 0, end: basis.length, whole: true });
  }
  if (/^(?:みんな|全員|全部|すべて)(?:止まる|とまる)$/.test(text)) {
    for (const op of ['ALL', 'OTHERS']) {
      const hint = hintCandidates(project, ctx.targetId, { ...ctx, source: basis, start: range.lineStart + range.indent, end: range.lineEnd }).find(h => h.id === 'StopCommand:' + op && h.enabled);
      if (hint) add(hint.text);
    }
  }
  if (ctx.definitionKind === 'action' && /^(?:全部|ぜんぶ)終わるまで待つ$/.test(text) && /「[^「」]+」の合図を送る。$/.test(basis.slice(0, range.lineStart).trimEnd())) {
    add('その合図で始まったことが全部終わるまで待つ。', { schemaId: 'WaitBroadcastGroup' });
  }
  if ((m = /^(?:タイマーが)?(\d+(?:\.\d+)?)秒(?:間)?(?:たつ|すぎる|がすぎる|たつの)(?:まで待つ|を待つ)$/.exec(text))) add(m[1] + '秒待つ。');
  if ((m = /^(\d+(?:\.\d+)?)秒(?:半|はん)待つ$/.exec(text))) add((Number(m[1]) + 0.5) + '秒待つ。');
  if ((m = /^(\d+(?:\.\d+)?)秒(?:たったら|すぎたら)、?(.+)$/.exec(text))) {
    const body = read(m[2]);
    if (body) add(m[1] + '秒待つ。\n' + body);
  }
  if ((m = /^(?:(?:ずっと|いつも)?(\d+(?:\.\d+)?)(?:秒|びょう)(?:ごとに|おきに|たつごとに|に1回)(?:ずっと)?|毎秒)、?(.*)$/.exec(text)) && ctx.definitionKind !== 'function') {
    const actor = /^(.*?)は$/.exec(m[2]);
    const tail = actor && [project.components.find(c => c.id === ctx.targetId)?.name, '自分'].includes(actor[1]) ? '' : m[2];
    const body = tail ? read(tail) : '';
    const header = 'ずっとくり返す。\n  ' + (m[1] || 1) + '秒待つ。';
    if (!tail || body && !actor) add(header + (body ? '\n' + indent(body) : ''));
  }
  if ((m = /^(.*?)((?:\d+))回(.+)$/.exec(text)) && !/くり返|くりかえ|繰り返/.test(m[3])) {
    const body = read(m[1] + m[3], true);
    if (body) add(m[2] + '回くり返す。\n' + indent(body));
  }
  if ((m = /^[「『](.+)[」』]を(\d+)回くり返す$/.exec(text))) {
    const clauses = assistSplit(m[1], '。').map(c => read(c.text));
    if (clauses.length && clauses.every(Boolean)) add(m[2] + '回くり返す。\n' + indent(clauses.join('\n')));
  }
  if ((m = /^(\d+(?:\.\d+)?)秒(?:のあいだに?|間|たつまで)(?:、)?(?:ずっと)?(?:くり返す)?(?:、)?(.*)$/.exec(text)) || (m = /^(\d+(?:\.\d+)?)秒くり返す(.*)$/.exec(text))) {
    const tail = m[2].replace(/^、/, '');
    if (!tail || tail === 'くり返す') add('タイマーを0にする。\nタイマーが' + m[1] + '以上になるまで、くり返す。', { schemaId: 'RepeatUntil', description: 'タイマーを 0に もどします' });
    else if (!/続ける|つづける|^(?:待つ|まつ)$/.test(tail)) {
      const body = read(tail);
      if (body) add('タイマーを0にする。\nタイマーが' + m[1] + '以上になるまで、くり返す。\n' + indent(body), { schemaId: 'RepeatUntil', description: 'タイマーを 0に もどします' });
    }
  }
  if (!/(?:キー|おしっぱなし|くり返|くりかえ|繰り返)/.test(text) && (/続ける|つづける/.test(text) || /^(?:ずっと|ずーっと|くり返し)/.test(text))) {
    let action = text.replace(/^(?:ずっと|ずーっと|くり返し)、?/, '');
    const duration = /^(\d+(?:\.\d+)?)秒(?:のあいだ|間)、?/.exec(action);
    if (duration) action = action.slice(duration[0].length);
    const speed = /(\d+(?:\.\d+)?)秒に(\d+(?:\.\d+)?)歩の速さで、?/.exec(action);
    if (speed) action = action.replace(speed[0], '');
    const until = /^(.+?まで)、?/.exec(action);
    if (until) action = action.slice(until[0].length);
    const stem = action.replace(/(?:続ける|つづける)$/, '');
    const dictionary = [...meijinDictionary(stem), ...assistClauseForms(stem)];
    const bodyOptions: string[] = [];
    if (speed && /動き|うごき|進み|すすみ/.test(stem)) {
      const direction = /(右|左|上|下|みぎ|ひだり|うえ|した)/.exec(stem)?.[1];
      const word = direction && ({ みぎ: '右', ひだり: '左', うえ: '上', した: '下' } as Partial<Record<string, string>>)[direction] || direction;
      bodyOptions.push(word ? speed[1] + '秒かけて、いまのばしょから、' + word + 'へ' + speed[2] + '歩動く。' : '前へ' + speed[2] + '歩進む。\n' + speed[1] + '秒待つ。');
    } else if (stem.trim()) {
      for (const form of dictionary) {
        if (form.length < 2) continue;
        const actionForm = /動|うご|進|すす/.test(stem) && !/(?:前|後ろ|右|左|上|下|まえ|うしろ|みぎ|ひだり|うえ|した)/.test(stem) ? '前へ' + form : form;
        const body = read(actionForm, true);
        if (body) { bodyOptions.push(body); break; }
      }
    }
    for (const body of bodyOptions) {
      const header = until ? until[1] + '、くり返す。' : duration ? duration[1] + '回くり返す。' : 'ずっとくり返す。';
      add(header + '\n' + indent(body));
    }
  }
  if ((m = /^(.+?)(?:ながら|つつ|のと同時に|あいだ(?:に)?)、?(.+)$/.exec(text)) && !isCondition(m[1] + 'あいだ') && !/が|キー.*(?:おされ|おして)|ふれない|^\d+(?:\.\d+)?秒の?$/.test(m[1])) {
    const stem = m[1];
    const before = [...assistClauseForms(stem), ...meijinDictionary(stem)].map(form => read(form)).find(Boolean);
    const after = read(m[2]);
    if (before && after) {
      const nonwaiting = (source: string) => source.replace(/」を鳴らす。$/, '」を鳴らし始める。').replace(/」と\d+(?:\.\d+)?秒話す。$/, '」と言う。');
      const a = nonwaiting(before);
      const b = nonwaiting(after);
      const waits = (source: string) => /秒|歩|待つ|鳴らす。/.test(source);
      add(!waits(a) && waits(b) ? a + '\n' + b : !waits(b) && waits(a) ? b + '\n' + a : a + '\n' + b);
    }
  }
  add(text.replace(/(あいだ|まで)、?(?:ずっと|何度も)(くり返す|待つ)$/, '$1、$2').replace(/^くり返しつづける$/, 'ずっとくり返す'));
  add(text.replace(/(あいだ|まで)、?(?:くりかえし|くり返し|ループ(?:する)?|リピート(?:する)?|つづける|くり返しする|ずっと)$/, '$1、くり返す'));
  add(text.replace(/(?:あいだは|あいだじゅう)、くり返す$/, 'あいだ、くり返す').replace(/(?:までは|までの間|までに)、?くり返す$/, 'まで、くり返す').replace(/(?:ときは|なら)、くり返す$/, 'あいだ、くり返す').replace(/まえに、くり返す$/, 'まで、くり返す'));
  add(text.replace(/まで(?:とまる|止まる|じっとする|じっとしている|そのまま|動かない|待機する|待機|たいきする)$/, 'まで待つ').replace(/まで、待つ$/, 'まで待つ'));
  if (/まで$/.test(text)) add(text + (basis.slice(range.lineEnd + 1).match(/^\s+/) ? '、くり返す。' : '待つ。'));
  add(text.replace(/^(?:何|なに)も(?:せず|しないで(?:ください|ね|おく)?|しなくていい(?:よ)?)$/, '何もしない'));
  add(text.replace(/^(?:何|なに)もしなくてよい$/, '何もしない'));
  add(text.replace(/とばして(?=次の回)/, 'とばして、'));
  add(text.replace(/^(もし「[^「」]+」キー)(?:がおされた|をおした)(?:とき|なら)、?$/, '$1がおされていれば、'));
  add(text.replace(/あいだ、(?!(?:くり返す|$))/, 'あいだ、くり返す。\n  ').replace(/まで、(?!(?:くり返す|$))/, 'まで、くり返す。\n  '));
  if ((m = /^(.+まで)、(.+)$/.exec(text))) {
    const body = read(m[2]);
    if (body) add(m[1] + '待つ。\n' + body);
  }
  for (const variable of project.projectData?.variables || []) {
    const q = assistEscapeRegex(variable.name);
    if ((m = new RegExp('^' + q + '\\s*[＝=は]\\s*(.+?)(?:にする)?$').exec(text))) add(nameSource(variable.name) + 'を' + m[1] + 'にする');
    if ((m = new RegExp('^' + q + 'を?([+＋−－-])(\\d+)(?:する)?$').exec(text))) add(nameSource(variable.name) + 'を' + m[2] + (/[+＋]/.test(m[1]) ? 'ふやす' : 'へらす'));
    add(text.replace(new RegExp('^' + q + 'を(.+?)に(?:ふやす|増やす|へらす|減らす)$'), (_match: string, g1: string) => nameSource(variable.name) + 'を' + g1 + 'にする'));
    add(text.replace(new RegExp('^' + q + 'を(.+?)と(?:おく|置く)$'), (_match: string, g1: string) => nameSource(variable.name) + 'を' + g1 + 'にする'));
    add(text.replace(new RegExp('^' + q + 'を(.+?)(?:から|で)(?:始める|はじめる|スタートする)$'), (_match: string, g1: string) => nameSource(variable.name) + 'を' + g1 + 'にする'));
  }
  if ((m = /^大きさを(-?\d+)ずつ(?:変える|かえる)$/.exec(text))) add('大きさを（大きさ' + (Number(m[1]) < 0 ? '−' : '＋') + Math.abs(Number(m[1])) + '）％にする');
  for (const list of project.projectData?.lists || []) {
    const q = assistEscapeRegex(list.name);
    if ((m = new RegExp('^' + q + 'から「([^「」]+)」を(?:消す|けす|取り出す)$').exec(text))) add(nameSource(list.name) + 'の（' + nameSource(list.name) + 'の中で「' + m[1] + '」がはじめて出てくる番号）番目を消す');
  }
  const nonCapMeijin = MEIJIN_WORD.replace(/^\(/, '(?:');
  const meijinEndPat = /(になるまで|のあいだ|であるあいだ|あいだ|なら|でなければ)(.*)$/.source;
  if ((m = new RegExp('^(もし)?(.+?)が(' + nonCapMeijin + ')' + meijinEndPat).exec(text))) {
    const subject = m[2];
    const word = meijinWordSpelling(m[3]);
    const mode = /あいだ$/.test(m[4]) ? 'while' : m[4] === 'になるまで' ? 'until' : 'if';
    const isNeg = m[4] === 'でなければ';
    const ending = mode === 'while' ? 'である' + 'あいだ' : mode === 'until' ? 'になるまで' : isNeg ? 'でなければ' : 'なら';
    const prefix = mode === 'if' ? 'もし' : '';
    const tail = m[5];
    try {
      const check = meijinWordCheck(subject, word);
      if (check.same) add(prefix + (mode === 'while' ? check.same : check.same.replace(/と同じ$/, '')) + ending + tail + (mode === 'while' && !tail ? '、くり返す' : ''));
      else if (/の倍数$/.test(word) && !isNeg) {
        const value = word.slice(0, -3);
        const last = subject + '÷' + value + 'のあまりが0' + (mode === 'while' ? 'と同じ' : '') + ending;
        add(prefix + subject + 'が0とちがっていて、' + last + tail);
        add(prefix + last + tail);
      } else {
        add(prefix + meijinWordTest(subject, word, m[4]) + tail);
      }
    } catch {}
  }
  if ((m = /^(もし)?(.+?)が(\d+)で割り切れるなら(.*)$/.exec(text))) add('もし' + m[2] + '÷' + m[3] + 'のあまりが0なら' + m[4]);
  if (/倍数|約数|偶数|奇数|割り切|からっぽ|より[右左上下]/.test(text)) {
    try {
      let source = text.replace(/ばいすう/g, '倍数');
      if (/より[右左上下]/.test(source)) {
        source = source.replace(/より([右左上下])なら/, 'より$1にいれば');
        let implicit = false;
        if (!/(?:「[^「」]+」|[^もし、]+)が.+より/.test(source)) {
          source = source.replace(/^もし/, '');
          source = (data.subject || own) + 'が' + source;
          implicit = !data.subject;
        }
        const written = meijinRewrite(source, ctx.symbols, ctx);
        if (written) {
          let result = written;
          if (implicit) result = result.replace('「' + own + '」のよこのばしょ', 'よこのばしょ').replace('「' + own + '」のたてのばしょ', 'たてのばしょ');
          if (!result.startsWith('もし') && /ければ/.test(result)) result = 'もし' + result;
          add(result);
        }
      } else {
        const written = meijinRewrite(source + (/、$/.test(range.text) && !source.endsWith('、') ? '、' : ''), ctx.symbols, ctx);
        if (written) add(written);
      }
    } catch {}
  }
  return sources.filter(entry => entry.text !== text);
}

export function assistSignalTransforms(text: string, project: Project, ctx: AssistContext, basis: string, range: AssistRange): AssistSource[] {
  if (ctx.definitionKind) return [];
  const sources: AssistSource[] = [];
  const signals = ctx.signalNames || { sent: [], received: [] };
  const names = [...new Set([...signals.sent, ...signals.received])];
  const owner = project.components.find(c => c.id === ctx.targetId);
  const known = (source: string) => source.replace(/[「」]/g, '').split(/と|、/).every(name => project.components.some(c => c.name === name));
  const sendName = () => signals.received.find(n => !signals.sent.includes(n)) || signals.received[0] || '開始';
  const add = (t: string, schemaId: string, description?: string | null) => sources.push({ text: t, schemaId, ...(description ? { description } : {}) });
  const send = (name: string, description?: string) => add('「' + name + '」の合図を送る。', 'Broadcast', description);
  const receive = (name: string | null, body = '', description?: string) => {
    if (ctx.targetId !== 'stage' && range.indent === 0) {
      add(sentenceHeadingSource({ event: 'message', actorRef: { kind: 'self' }, filter: name ? { message: name } : null }) + (body ? '\n  ' + body.replace(/\n/g, '\n  ') : ''), 'Heading:message', description);
    }
  };
  let m: RegExpExecArray | null;
  if ((m = /^(.+?)(?:に|へ)「([^「」]+)」(?:と(?:言って)?(?:知らせ|つたえ|教え|伝え)(?:る|て|ます)|の合図を(?:送る|おくる|送って|送ります))$/.exec(text)) && known(m[1])) send(m[2], '合図は、作品の みんなに とどきます');
  if ((m = /^「([^「」]+)」の合図を(.+?)に(?:送る|おくる|送ります)$/.exec(text)) && known(m[2])) send(m[1], '合図は、作品の みんなに とどきます');
  if ((m = /^(.+?)(?:に|へ)「([^「」]+)」と(?:言う|話す|いう)$/.exec(text)) && known(m[1])) { send(m[2], '合図は、作品の みんなに とどきます'); add('「' + m[2] + '」と言う。', 'Say'); }
  if (/^合図を(?:送る|出す)$/.test(text)) send(sendName());
  if (/^合図を送って、?待つ$/.test(text)) add('「' + sendName() + '」の合図を送って、その合図で始まったことが全部終わるまで待つ。', 'BroadcastAndWait');
  if ((m = /^(.+?)(?:から|の)(?:「([^「」]+)」の)?合図(?:が来た|がきた|が届いた|がとどいた|を受けた|をうけた|を受け取った|をもらった|を受信した)(?:とき|ら)、?$/.exec(text)) && known(m[1])) {
    const sender = m[1].replace(/[「」]/g, '');
    const choices = m[2] ? (names.includes(sender + 'から' + m[2]) ? [sender + 'から' + m[2]] : names.includes(m[2]) ? [m[2]] : [m[2], sender + 'から' + m[2]]) : names.filter(name => name.startsWith(sender + 'から'));
    if (!choices.length) choices.push(sender + 'から出発');
    for (const name of choices.slice(0, ASSIST_MAX)) receive(name, '', '送る ほうも「' + name + '」という 名前で 送ります');
  }
  if ((m = /^「([^「」]+)」(?:の合図(?:が来た|がきた|が届いた|がとどいた)|が(?:来た|きた|届いた)|の合図を(?:もらった|受信した))(?:とき|ら)、?(.*)$/.exec(text))) {
    let body = m[2];
    const subject = /^(.+?)は、?$/.exec(body);
    if (subject) { if (subject[1] !== owner?.name) return sources; body = ''; }
    receive(m[1], body);
  }
  if ((m = /^(?:【([^【】]+)】|([^「」]+?))(?:の|という)?合図を受けたとき、?$/.exec(text)) && names.includes(m[1] || m[2])) receive(m[1] || m[2]);
  if (/^合図(?:が来た|がきた|が届いた|がとどいた)とき、?$/.test(text)) receive(null);
  if ((m = /^(?:(.+?)(?:に|へ))?「([^「」]+)」(?:の合図を(?:送って|おくって)(?:から)?|(?:と|を(?:みんなに)?)知らせて)、?(.*(?:待つ|まつ|待ちます))$/.exec(text)) && (!m[1] || known(m[1]))) {
    add('「' + m[2] + '」の合図を送って、その合図で始まったことが全部終わるまで待つ。', 'BroadcastAndWait', m[1] ? '合図は、作品の みんなに とどきます' : null);
  }
  if (/^(?:その合図で始まったことが)?(?:全部|ぜんぶ|みんなが|みんなの仕事が|受けた人が)?(?:終わる|おわる)(?:まで|のを)、?(?:待つ|まつ|待ちます|待って)$/.test(text)) {
    const previous = basis.slice(0, range.lineStart).trimEnd().split('\n').at(-1) || '';
    const sent = /「([^「」]+)」の合図を送る。$/.exec(previous);
    const wait = 'その合図で始まったことが全部終わるまで待つ。';
    add(sent ? wait : '「' + sendName() + '」の合図を送る。\n' + wait, 'WaitBroadcastGroup');
  }
  return sources;
}

export function assistCompose(project: Project, basis: string, range: AssistRange, ctx: AssistContext, data: AssistData, framed: boolean, state?: AssistRunState): { sources: AssistSource[]; composed: boolean } {
  type Option = { text: string; schemaId?: string; defaultNumericSlots?: boolean };
  type Part = { condition?: string; options: Option[]; readable: boolean; schemaId?: string };
  if (searchIntent(data.text)?.schemaId === 'ContinuousRule') return { sources: [], composed: false };
  if (data.strings.length && (/(?:たずね|聞[くいき]|き[くい]|質問|しつもん|言って|といい).*(?:答え|こたえ|返事)/.test(data.text) || /(?:合図.*(?:送|おく)|知らせて).*(?:待|まつ)/.test(data.text))) return { sources: [], composed: false };
  if (/をわたして|として|という(?:手順|てじゅん)を/.test(data.text)) return { sources: [], composed: false };
  if (/(?:あいだ(?:は|じゅう)?|まで)、?(?:ずっと|何度も|くりかえし|くり返し|ループ(?:する)?|リピート(?:する)?|つづける|くり返しする|くり返す)$/.test(data.text)) return { sources: [], composed: false };
  if (/(?:のを|ことを)、?\d+回(?:くり返|繰返|くりかえ)/.test(data.text)) return { sources: [], composed: false };
  const clauses = data.clauses.map(c => c.text.trim()).filter(Boolean);
  const conditional = clauses.length > 1 && /^(?:もし|.*(?:たら|れば|なら|とき|あいだ|まで)$)/.test(clauses[0]);
  const connective = clauses.length > 1 && /(?:て|で|たら|たあと|た後に|た後で)$/.test(clauses[0]);
  if (!conditional && !connective) return { sources: [], composed: false };
  const parts = clauses.map((text, index): Part => {
    if (index === 0 && conditional) return { condition: text, options: [{ text }], readable: true };
    for (const form of assistClauseForms(text)) {
      try {
        const parsed = parseSyntax(form + '。', ctx);
        if (parsed.ast) return { options: [{ text: formatScript(parsed.ast).trim() }], readable: true, schemaId: syntaxSchema(parsed.ast.body?.[0])?.id || parsed.ast.body?.[0]?.kind };
      } catch {}
    }
    const seeds = assistSeeds(text, ctx.symbols, ctx);
    const options = assistSearch(project, basis, range, ctx, seeds, state).filter(c => c.layer < 6).sort((a, b) => /^音を出/.test(text) ? Number(b.schemaId === 'SoundCommand:SAMPLE_WAIT') - Number(a.schemaId === 'SoundCommand:SAMPLE_WAIT') || assistCompare(a, b, ctx) : assistCompare(a, b, ctx)).slice(0, 3).map(c => ({ text: c.text, schemaId: c.schemaId, defaultNumericSlots: c.defaultNumericSlots }));
    return { options, readable: false };
  });
  const unreadable = parts.filter(p => !p.readable);
  if (unreadable.length > (framed ? 3 : 1) || parts.some(p => !p.options.length)) return { sources: [], composed: true };
  const index = parts.findIndex(p => !p.readable);
  const sources: AssistSource[] = [];
  const same = (a: Option, b: Option) => a.text.replace(/[\s。]/g, '') === b.text.replace(/[\s。]/g, '');
  let combos: Option[][] = [[]];
  for (const [i, part] of parts.entries()) {
    combos = combos.flatMap(combo => (part.readable ? [part.options[0]] : part.options.filter(o => !o.defaultNumericSlots && (framed || !parts.some((q, k) => k !== i && q.readable && same(q.options[0], o))))).map(o => [...combo, o]));
  }
  for (const combo of combos) {
    const replacement = index >= 0 ? combo[index] : null;
    const texts = combo.map(o => o.text);
    const extra = index >= 0 && !/^もし/.test(data.text) && (index === 0 || conditional || parts[0].schemaId === 'WaitTime') ? { schemaId: replacement!.schemaId } : {};
    if (conditional) {
      const action = texts.slice(1).join('\n');
      if (/^(?:もし|.+あいだ、|.+まで、|.+ふれていれば、はね返る)/.test(action)) sources.push({ text: action, ...extra });
      else sources.push({ text: texts[0] + '、' + action, ...extra });
    } else {
      sources.push({ text: texts.join('\n'), ...extra });
    }
  }
  if (conditional) {
    for (const candidate of assistSearch(project, basis, range, ctx, data, state)) {
      if (searchReading(candidate.text).startsWith(searchReading(clauses[0] + '、'))) sources.push({ text: candidate.text, schemaId: candidate.schemaId });
    }
  }
  return { sources, composed: true };
}

export function assistTransforms(text: string, data: AssistData, project: Project, ctx: AssistContext): string[] {
  const out = new Set<string>();
  const add = (s: string) => { if (s && s !== text) out.add(s); };
  const quoted: string[] = [];
  const protectedText = text.replace(/「[^「」]*」|『[^『』]*』|｢[^｢｣]*｣|"[^"]*"/g, s => '「\uE002' + (quoted.push(s) - 1) + '\uE003」');
  const restore = (source: string) => source.replace(/「\uE002(\d+)\uE003」/g, (_: string, i: `${number}`) => quoted[i]);
  for (const v of searchQueryVariants(protectedText, { condition: true })) add(restore(v));
  const condition = /^(?:もし|.*(?:なら|ならば|たら|れば|とき(?:は)?|あいだ|間|まで|場合|うちは|かぎり)$)/.test(data.clauses[0]?.text || '') || /まで(?:待つ|まつ)$/.test(text);
  if (condition) {
    const pieces = assistSplit(protectedText, '、');
    const head = pieces[0];
    if (head) for (const variant of searchQueryVariants(head.text, { condition: true })) add(restore(variant + protectedText.slice(head.end)));
    let normalized = protectedText;
    normalized = normalized.replace(/ふくまれて/g, '含まれて').replace(/はいって/g, '入って').replace(/でかつ|でさらに|そして|かつ/g, 'で').replace(/か、または/g, 'か、').replace(/もしくは|または/g, 'か');
    for (const form of CONDITION_FORMS) {
      for (const condEnd of [form.andYes, form.andNo].filter(Boolean).sort((a, b) => b.length - a.length)) {
        const suffix = condEnd.replace(/[、。]+$/, '');
        if (suffix) normalized = normalized.split(suffix).map((part, i, all) => i === all.length - 1 ? part : part + suffix).join('、').replace(/、、/g, '、');
      }
    }
    normalized = normalized.replace(/(以上|以下|大きい|小さい|と同じ|ではない|とちがう|いる|いない|である)か(?!、)/g, '$1か、').replace(/より(大きく|小さく)、/g, 'より$1て、');
    add(restore(normalized));
    const conditionVariants = new Set([protectedText, normalized, ...searchQueryVariants(protectedText, { condition: true })]);
    for (const input of conditionVariants) {
      let v = input.replace(/^もしコピー/, 'もし自分がコピー').replace(/てる(?=あいだ|なら|、)/g, 'ている').replace(/てなければ/g, 'ていなければ').replace(/ているなら/g, 'ていれば').replace(/ふれるなら/g, 'ふれていれば').replace(/じゃなかった(?:なら|ら)/g, 'と同じでなければ').replace(/(大き|小さ)くなったら/g, '$1ければ').replace(/になったとき(?:は)?/g, 'になったら').replace(/(?:うちは|かぎり|の間は|間は)/g, 'あいだ');
      if (/^もし自分がコピー/.test(v)) v = v.replace(/じゃなかったら|と同じでなければ/, 'でなければ');
      if (data.names.some(n => n.kind === 'list')) v = v.replace(/に(「\uE002\d+\uE003」)(?:が)?(?:いる|いた|入っていた)(?:なら|と)/g, 'に$1が入っていれば');
      if (/以上で|以下で/.test(v) && /キーがおされるまで待つ$/.test(v)) v = v.replace(/(以上で|以下で)(?!、)/g, '$1、').replace(/キーがおされるまで待つ$/, 'キーがおされている状態になるまで待つ');
      if (/(?:大き|小さ)ければ$/.test(v) && !v.startsWith('もし')) v = 'もし' + v;
      add(restore(v));
    }
    add(restore(protectedText.replace(/より上/g, 'より大きい').replace(/より下/g, 'より小さい').replace(/と等しい/g, 'と同じ').replace(/をこえる/g, 'より大きくなる').replace(/(\d+(?:\.\d+)?)(?:てん|点|こ|個|ほ|歩|ど|度|パーセント|％)(?=以上|以下|より|と|なら|にな)/g, '$1')));
    add(restore(protectedText.replace(/くっつい|かさなっ|重なっ|さわっ|あたっ/g, 'ふれ').replace(/くっつく|かさなる|重なる|さわる|あたる/g, 'ふれる').replace(/クリックされた|クリックした/g, 'おされた')));
  }
  add(text.replace(/，/g, '、').replace(/[．]/g, '。'));
  add(text.replace(/」って(?=言う|いう)/g, '」と'));
  add(text.replace(/(\d+(?:\.\d+)?)(?:パーセント|ぱーせんと|パー)/g, '$1％').replace(/(\d+)(?:びょう)/g, '$1秒').replace(/(\d+)(?:px|ピクセル)/g, '$1').replace(/(\d+)ばい/g, '$1倍').replace(/hz/gi, 'Hz').replace(/秒間(?=[鳴な])/g, '秒'));
  if ((text.match(/、/g) || []).length === 1) add(text.replace('、', ''));
  else add(text.replace(/(\d+(?:\.\d+)?(?:歩|秒|度|％))、/g, '$1'));
  add(text.replace(/「([^「」]+)」/g, (s: string, name: string) => data.names.some(n => n.name === name) ? name : s));
  for (const n of data.names) {
    const name = assistEscapeRegex(n.name);
    add(text.replace(new RegExp('(?:変数|へんすう|リスト)' + name + '(?:の値|の中身)?', 'g'), () => n.name).replace(new RegExp(name + '(?:の値|の中身)', 'g'), () => n.name));
  }
  if (/^「[^「」]+」$/.test(text)) add(text.slice(1, -1));
  add(text.replace(/^もし(?=.+(?:とき|たら)(?:、|$))/, ''));
  add(text.replace(/になった(?:とき|ときは)、/g, 'になったら、'));
  add(text.replace(/(毎秒|(?:(\d+(?:\.\d+)?)秒)(?:おきに|たつごとに|に1回))、?$/, (_: string, _a: string, n: string | undefined) => (n || 1) + '秒ごとに、'));
  let m: RegExpExecArray | null;
  if ((m = /^(\d+(?:\.\d+)?)秒(?:間)?ごとに、?$/.exec(text)) && ctx.definitionKind !== 'function') add('ずっとくり返す。\n  ' + m[1] + '秒待つ。');
  add(text.replace(/(?:それ以外(?:は|のとき)?|それいがい(?:は|のとき)?|そうでないと|でないと|ほかは|もしそうでなければ|じゃなければ)、?$/, 'そうでなければ、'));
  add(text.replace(/(?:の場合(?:は|には)?|のばあい(?:は|には)?|だったとき|なとき|の時|だと|だったなら|だったとしたら|だとしたら|ならばね|ならね)、?$/, 'なら、'));
  add(text.replace(/^(ずっと){2,}/, 'ずっと'));
  add(text.replace(/^(?:\/\/|／／|#|＃|--|\* |\/\*)\s*(.*?)(?:\*\/)?$/, '※ $1').replace(/。\s*(?:\/\/|／／|#|＃|--|\/\*)\s*(.*?)(?:\*\/)?$/, '。  ※ $1'));
  if ((m = /^(.+?)を?([+＋−－-])(\d+)(?:する)?$/.exec(text)) && data.names.some(n => n.kind === 'variable' && n.name === m![1])) add(m[1] + 'を' + m[3] + (/[+＋]/.test(m[2]) ? 'ふやす' : 'へらす'));
  if ((m = /^(.+?)(?:＝|=|は)(.+?)(?:にする)?$/.exec(text)) && data.names.some(n => n.kind === 'variable' && n.name === m![1])) add(m[1] + 'を' + m[2] + 'にする');
  if ((m = /^(.+?)を(.+?)とする$/.exec(text)) && data.names.some(n => n.kind === 'variable' && n.name === m![1])) add(m[1] + 'を' + m[2] + 'にする');
  if ((m = /^(.+?)を(-?\d+)(?:ずつ変える|ずつかえる|大きくする|小さくする)$/.exec(text)) && (m[1] === '大きさ' || data.names.some(n => n.kind === 'variable' && n.name === m![1]))) {
    if (m[1] === '大きさ') add('大きさを（大きさ' + ((/小さく/.test(text) !== (Number(m[2]) < 0)) ? '－' : '＋') + Math.abs(Number(m[2])) + '）％にする');
    else add(m[1] + 'を' + Math.abs(Number(m[2])) + ((/小さく/.test(text) !== (Number(m[2]) < 0)) ? 'へらす' : 'ふやす'));
  }
  if ((m = /^(.+?)を(\d+(?:\.\d+)?)(?:倍|ばい)にする$/.exec(text)) && data.names.some(n => n.kind === 'variable' && n.name === m![1])) add(m[1] + 'を' + m[1] + '×' + m[2] + 'にする');
  if ((m = /^向きを【?(.+?)】?にする$/.exec(text)) && data.names.some(n => n.kind === 'variable' && n.name === m![1])) add('向きを【' + m[1] + '】度にする');
  if ((m = /^(.+?)を(\d+)まで(ふやす|増やす|へらす|減らす)$/.exec(text)) && data.names.some(n => n.kind === 'variable' && n.name === m![1])) {
    add(m[1] + 'を' + m[2] + 'にする');
    add(m[1] + 'が' + m[2] + (/ふやす|増やす/.test(m[3]) ? '以上' : '以下') + 'になるまで、くり返す。\n  ' + m[1] + 'を1' + (/ふやす|増やす/.test(m[3]) ? 'ふやす' : 'へらす') + '。');
  }
  for (const name of data.names.filter(n => n.kind === 'list')) {
    const q = assistEscapeRegex(name.name);
    add(text.replace(new RegExp(q + 'の(\\d+)番目の(?:後|あと|うしろ)に'), (_: string, n: string) => name.name + 'の' + (Number(n) + 1) + '番目に'));
    add(text.replace(new RegExp(q + 'の(?:さいご|最後|最後のもの|おわり)'), () => name.name + 'の（' + name.name + 'の数）番目').replace(new RegExp(q + 'の(?:先頭|最初|はじめ)'), () => name.name + 'の1番目'));
  }
  for (const name of data.names.filter(n => n.kind === 'sound')) {
    const q = assistEscapeRegex(name.name);
    if (new RegExp('^「?' + q + '」?を(?:かける|かけて|かけます)$').test(text)) add('「' + name.name + '」を鳴らす。');
  }
  if ((m = /^画面の(左下|右下|左上|右上)(?:のはし|のすみ|の角)?(?:へ|に)(?:行く|もどる|動く|移動する)$/.exec(text))) {
    add('画面の左下のはしから、右へ' + (m[1].includes('右') ? (project.stage.width || 640) : 0) + '歩、上へ' + (m[1].includes('上') ? (project.stage.height || 400) : 0) + '歩のばしょへ行く。');
  }
  if (/^(?:はじめ|最初|さいしょ|もと|元)(?:の)?ばしょ(?:へ|に)(?:もどる|戻る|行く)$/.test(text)) {
    const owner = project.components.find(c => c.id === ctx.targetId);
    if (owner) add('画面の左下のはしから、右へ' + owner.x + '歩、上へ' + owner.y + '歩のばしょへ行く。');
  }
  if (/^(?:自分|自分だけ)(?:を|の動きを)?(?:全部|だけ)?(?:止める|止まる|とめる|とまる)$/.test(text)) add('自分のほかの動きを止める。\nこの動きを止める。');
  add(text.replace(/([^、。]+?)(?:を|へ|が|で)(ふれ(?:た|る|て|ている|たら))/g, (s: string, name: string, verb: string) => data.names.some(n => n.kind === 'part' && ['「' + n.name + '」', n.name].includes(name)) || name === '画面のはし' ? name + 'に' + verb : s));
  add(text.replace(/(として|をわたして)(?!、)/g, '$1、').replace(/のを(\d+)回くり返す/, 'ことを$1回くり返す'));
  if (text.length <= 60) add(text.replace(/([うくぐすつぬぶむる])(?:\s+|[.，．・；→])(?=.)/g, '$1。\n'));
  if (/なら|たら|あいだ|まで/.test(text)) add(text.replace(/より上/g, 'より大きい').replace(/より下/g, 'より小さい').replace(/と等しい/g, 'と同じ').replace(/さわ|くっつ|かさな|重な|あた/g, 'ふれ').replace(/クリックされた|クリックした/g, 'おされた'));
  for (const v of [...out]) {
    if (v.includes('、') && /^(?:もし|.+(?:とき|たら|ごと|たび)|.+くり返す)/.test(v)) {
      const at = v.indexOf('、');
      if (v.slice(at + 1).trim()) add(v.slice(0, at + 1) + '\n  ' + v.slice(at + 1).trim());
    }
  }
  return [...out];
}
