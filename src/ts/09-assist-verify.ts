import { buildSymbols } from './03-default-assets.ts';
import { parseSyntax } from './04-syntax-expressions.ts';
import { keyWord, readSentenceHeading, sentenceActorSource } from './04-syntax-sentences.ts';
import { documentSyntaxItems } from './07-semantic-analysis-core.ts';
import { analyzeAst } from './07-semantic-analysis.ts';
import { searchIntent } from './09-editor-search-core.ts';
import { ASSIST_DATA_KINDS, ASSIST_MAX_COND_ENDS, ASSIST_PART_VERBS, assistEscapeRegex, assistLongestFirst, assistNodes, assistNumberText, assistVerificationContext } from './09-assist-normalize.ts';
import type { AssistContext, AssistData, AssistGot, AssistMeaning, AssistNode, AssistQuantity, AssistWant, AssistWorkCheckBaseline, AssistWorkCheckCache } from '../types/assist.d.ts';
import type { Diagnostic } from '../types/compiled.d.ts';
import type { Project } from '../types/project.d.ts';
import type { Proposal } from '../types/runtime.d.ts';
import type { ActorRef } from '../types/syntax-base.d.ts';
import type { Expression, Script } from '../types/syntax.d.ts';

// ────────────────────────────────────────────────────────────────────────
// 09 — Code assist stage 4: verification, meaning frames, and semantic gates
// ────────────────────────────────────────────────────────────────────────

const ASSIST_ACTION_ENDS: readonly (readonly [string, RegExp])[] = [
  ['say', /(?:言|話)(?:う|って|わせる|わせて|わせ|い|す|して|させる|させて|させ|し)$|いう$|いわせ(?:る|て)?$|しゃべ|叫|つぶや/],
  ['clone', /(?:コピー|クローン|複製|ふくせい|分身)を?(?:\d+(?:つ|こ|個|体|匹)、?)?(?:作|つく)(?:る|って|らせる|らせて|らせ|り)$|(?:コピー|クローン|複製|ふくせい)(?:する|して|させる|させて)$/],
  ['wait', /待(?:つ|って|ち)$|まつ$/],
  ['turn', /(?:回|まわ)(?:る|って|す|して|らせる|らせて|り)$|回転(?:する|して|させる|させて)$/],
  ['move', /(?:動|うご)(?:く|いて|き|かす|かして|かせる|かせて)$|(?:進|すす)(?:む|んで|み|ませる|ませて|める|めて)$|(?:移動|いどう)(?:する|して|させる|させて|させ|し)$|行(?:く|って|き|かせる|かせて)$|(?:走|はし)(?:る|って|り|らせる|らせて)$|ジャンプ(?:する|して|させる|させて)$/],
];

const assistActionOf = (id: string | null | undefined): string | null =>
  !id ? null
    : /^MotionCommand:(?:TURN|SET_DIRECTION|POINT_TO)/.test(id) ? 'turn'
      : /^MotionCommand:/.test(id) ? 'move'
        : /^CloneCommand:/.test(id) ? 'clone'
          : ({ Say: 'say', Think: 'say', Ask: 'ask', WaitTime: 'wait', WaitUntil: 'wait' } as Partial<Record<string, string>>)[id] || 'other:' + id.split(':')[0];

const ASSIST_DIRECTIONS = { 右: 'right', 左: 'left', 上: 'up', 下: 'down', 前: 'forward', 後ろ: 'backward', うしろ: 'backward' };
const ASSIST_WHOLE_WORK = /^(?:SoundCommand:STOP_ALL|LooksCommand:(?:SET|NEXT|PREV)_BACKDROP|PenCommand:CLEAR|StopCommand:(?:THIS|OTHERS|ALL))$/;
const ASSIST_WAYS = /^MotionCommand:(?:MOVE|MOVE_BY|TURN_RIGHT|TURN_LEFT)$/;
const ASSIST_VERB_STEMS = /動(?!き[をがはのに])|進|移動|走|待|回|言|話/g;

export const assistListAllSaid = (data: AssistData) => data.names.some(n => n.kind === 'list') && /全部(?:言う|話す)$/.test(data.text);

export function assistMeaningFrames(data: AssistData, project: Project, ctx: AssistContext, source: unknown): AssistWant[] | null {
  const owner = project.components.find(c => c.id === ctx.targetId)?.name || null;
  const parts = project.components.map(c => c.name).sort(assistLongestFirst);
  const text = data.text;
  if (
    data.subjects ||
    /もし|なら|たら|れば|とき|時(?=[、。]|$)|場合|ばあい|だと|あいだ|(?<![時空間])間|まで|ずっと|続け|つづけ|くり返|繰り返|くりかえ|ごとに|たびに|おきに|毎秒|\d+回|何回|次の回|この回|ずつ|一つずつ|ひとつずつ|順に|順番|じゅんに|じゅんばん|同時|速さ|はやさ|スピード|手順|てじゅん|という|合図|メッセージ|知らせ|として|ながら|うちに|答え|こたえ|返事/.test(text.replace(/「[^「」]*」|『[^『』]*』/g, '')) ||
    /(?:音の)?大きさ(?:を|が)\s*-?\d+(?:\.\d+)?(?:％|%|パーセント)?(?:大きく|小さく|ふや|増や|へら|減ら)/.test(text) ||
    /(?:[xXyYｘＸｙＹ]|横|よこ|縦|たて)(?:座標|ざひょう)?を-?\d+(?:\.\d+)?(?:ずつ)?(?:変える|かえる)/.test(text) ||
    data.names.some(n => ['action', 'function'].includes(n.kind))
  ) return null;
  if (assistListAllSaid(data)) return null;
  const words = [...new Set([...parts, ...data.names.map(n => n.name)])].sort(assistLongestFirst);
  const names = parts.map(assistEscapeRegex).join('|');
  const causer = names && /(?:させ|せる|かす|かせ)(?:る)?$/.test(text) ? new RegExp('^(?:「)?(' + names + ')(?:」)?(?:を|に)').exec(text) : null;
  let subject = data.subject ? (['自分', '体'].includes(data.subject) ? owner : data.subject) : causer?.[1] || null;
  let written = !!causer || !!data.subject && !new RegExp('^(?:「)?' + assistEscapeRegex(data.subject) + '(?:」)?の').test(String(source).trim());
  const frames: AssistWant[] = [];
  let pending = '';
  for (const [index, clause] of data.clauses.entries()) {
    const raw = pending + assistNumberText(clause.text);
    const quotes = [...raw.matchAll(/「([^「」]*)」(の|へ|に|を|まで)?|『([^『』]*)』/g)].map(m => ({ value: m[1] ?? m[3], toward: !!m[2] }));
    const outside = raw.replace(/「[^「」]*」|『[^『』]*』/g, quote => '§'.repeat(quote.length));
    let masked = outside;
    for (const name of words) masked = masked.split(name).join('□'.repeat(name.length));
    const end = masked.replace(/(?:たい|ます|ました|なさい|ください|てね|ね|よ|ほしい|ちゃう|ちゃって|[！!。])+$/, '');
    const ending = ASSIST_ACTION_ENDS.find(([, pattern]) => pattern.test(end))?.[0] || null;
    if ((masked.match(ASSIST_VERB_STEMS) || []).length > 1) return null;
    if (!ending && index < data.clauses.length - 1 && (/(?:かけて|かけ|から|まで|歩|秒|度|％|\d)$/.test(end) || /[^ぁ-ん](?:で|に|へ|を|と|は|が|も)$/.test(end) || !/[ぁ-ん]$/.test(end))) {
      pending = raw + '、';
      continue;
    }
    pending = '';
    const made = names && (
      new RegExp('((?:「?(?:' + names + ')」?(?:と|、))+「?(?:' + names + ')」?)(?:を|に)(?=.*(?:させ|せる|せて|かす|かして|かせ|' + ASSIST_PART_VERBS.source + '))').exec(outside) ||
      new RegExp('(' + names + ')(?:を|に)(?=.*(?:させ|せる|せて|かす|かして|かせ))').exec(outside) ||
      new RegExp('(' + names + ')を(?=.*(?:' + ASSIST_PART_VERBS.source + '))').exec(outside)
    );
    const named = new RegExp('^(?:「)?(' + [names, '自分'].filter(Boolean).join('|') + ')(?:」)?(?:は|が|も)、?').exec(outside) || made;
    const carried = [subject, written] as const;
    if (named) {
      subject = named[1] === '自分' ? owner : named[1].replace(/[「」]/g, '');
      written = true;
    }
    const read = raw.replace(/「([^「」]*)」|『([^『』]*)』/g, (quote: string, a: string | undefined, b: string | undefined) => words.includes(a ?? b) ? quote : '「□」');
    const told = ['say', 'clone', 'wait'].includes(ending);
    const intent = told ? null : searchIntent(read, ctx) || searchIntent(read.replace(/([えけげせぜてでねべめれいきしちにびみり])[たて]$/, '$1る'), ctx);
    const action = told ? ending : assistActionOf(intent?.schemaId) || ending;
    const way = /(?<![一-龯ァ-ヶ])(右|左|上|下|前|後ろ|うしろ)(?:へ|に|の方|方向|むき|向き|側|がわ)/.exec(masked.replace(/画面の|がめんの/g, ''));
    const frame: AssistWant = {
      action,
      stated: !!ending,
      subject,
      written,
      directions: ['move', 'turn', null].includes(action) ? intent?.directions || (intent?.direction ? [intent.direction] : way ? [ASSIST_DIRECTIONS[way[1] as keyof typeof ASSIST_DIRECTIONS]] : []) : [],
      quantities: [],
      strings: quotes.filter(q => !(q.toward && parts.includes(q.value))).map(q => q.value),
      names: quotes.map(q => q.value).filter(v => words.includes(v) || data.keys.includes(keyWord(v))),
      raw,
      copy: /(?:コピー|こぴー|クローン|くろーん|複製|ふくせい|分身|ぶんしん|ふや|増や)/.test(masked),
      quoted: /[「」『』（）()【】［］〈〉《》｢｣"]/.test(raw),
      objects: [],
      tell: action === 'say' && !!names && new RegExp('(?:' + names + '|「(?:' + names + ')」)に').test(raw.replace(/「([^「」]*)」(?!に)/g, quote => '§'.repeat(quote.length))),
    };
    const before: AssistWant[] = [];
    for (const m of outside.matchAll(/(-?\d+(?:\.\d+)?)(歩|ほ|ぽ|度|ど|秒|びょう|％|%|倍|ばい)(半|はん)?/g)) {
      const unit = ({ ほ: '歩', ぽ: '歩', ど: '度', びょう: '秒', '%': '％', ばい: '倍' } as Partial<Record<string, string>>)[m[2]] || m[2];
      const value = Number(m[1]) + (m[3] && unit === '秒' ? 0.5 : 0);
      const after = outside.slice(m.index + m[0].length);
      if (unit === '倍') { frame.quantities.push({ unit: '％', value: value * 100, role: '％' }); continue; }
      if (unit !== '秒') { frame.quantities.push({ unit, value, role: unit }); continue; }
      if (action === 'wait') frame.quantities.push({ unit, value, role: 'wait' });
      else if (/^(?:後|ご|あと|たって|経って|たった|待って|まって|待ち)/.test(after)) before.push({ action: 'wait', subject, written, directions: [], quantities: [{ unit, value, role: 'wait' }], strings: [], objects: [] });
      else frame.quantities.push({ unit, value, role: /^(?:間)?(?:かけて|かけ|で(?![はもき])|ほどで|くらいで|ぐらいで)/.test(after) ? 'during' : 'unknown' });
    }
    let rest = outside;
    for (const name of parts) {
      if (rest.includes(name)) {
        if (name !== subject) frame.objects.push(name);
        rest = rest.split(name).join('□'.repeat(name.length));
      }
    }
    if (/自分(?![はがも])/.test(rest)) frame.objects.push(subject || owner);
    for (const q of quotes) if (q.toward && parts.includes(q.value) && q.value !== subject) frame.objects.push(q.value);
    frames.push(...before, ...(before.length && !frame.action && ![frame.directions, frame.quantities, frame.strings, frame.objects].some(r => r.length) ? [] : [frame]));
    if (named && named === made) [subject, written] = [carried[0] ?? owner, carried[1]];
  }
  return frames.some(f => f.action || f.directions.length || f.quantities.length || f.strings.length || f.objects.length || f.subject && f.subject !== owner) ? frames : null;
}

export function assistAstFrames(ast: Script | null | undefined, project: Project, ctx: AssistContext): AssistGot[] | null {
  if (!ast || ast.heading || ast.rules?.length) return null;
  const owner = project.components.find(c => c.id === ctx.targetId)?.name || null;
  const parts = project.components.map(c => c.name);
  const frames: AssistGot[] = [];
  const number = (v: Expression | null | undefined) => v?.kind === 'QuantityLiteral' && v.value?.kind === 'NumberLiteral' ? { unit: v.unit, value: v.value.value } : null;
  for (const n of ast.body || []) {
    if (n.kind === 'CommentLine') continue;
    if (n.body || n.thenBody || n.lanes) return null;
    const id = n.op ? n.kind + ':' + n.op : n.kind;
    const action = assistActionOf(id);
    const subject = n.actorRef?.kind === 'named' ? n.actorRef.name : n.actorRef?.kind === 'all' ? null : owner;
    const strings: string[] = [];
    const said: string[] = [];
    const objects: (string | null)[] = [];
    const quantities: AssistQuantity[] = [];
    const direction = n.op === 'MOVE_BY' ? (n.x ? n.xDir : n.y ? n.yDir : null) : n.op === 'MOVE' ? n.direction : n.op === 'TURN_RIGHT' ? 'right' : n.op === 'TURN_LEFT' ? 'left' : null;
    for (const key of ['x', 'y', 'seconds'] as const) {
      if (number(n[key])) quantities.push({ ...number(n[key])!, role: key === 'seconds' ? (n.kind === 'WaitTime' ? 'wait' : 'during') : number(n[key])!.unit });
    }
    for (const arg of n.args as Expression[] | undefined || []) {
      const q = number(arg);
      if (q) quantities.push({ ...q, role: q.unit });
      else if (arg?.kind === 'StringLiteral') (parts.includes(arg.value) ? objects : strings).push(arg.value);
    }
    for (const key of ['value', 'message', 'question'] as const) {
      if (n[key]?.kind === 'StringLiteral') { strings.push(n[key].value); said.push(n[key].value); }
    }
    if (n.kind === 'CloneCommand' && n.op === 'CREATE_SELF') objects.push(subject);
    frames.push({ action, subject, direction, ways: ASSIST_WAYS.test(id), whole: ASSIST_WHOLE_WORK.test(id), creates: n.kind === 'CloneCommand' && /^CREATE/.test(n.op), quantities, strings, said, objects, explicit: n.actorRef?.kind === 'named' });
  }
  return frames;
}

function assistMeaningPair(w: AssistWant, g: AssistGot): AssistMeaning | null {
  if (['move', 'turn'].includes(g.action) && g.objects.includes(g.subject)) return null;
  if (g.creates && w.copy === false) return null;
  let missing = 0;
  let explicit = true;
  let kept = 0;
  let named = 0;
  const differs = w.action && g.action !== w.action && !(w.tell && /^other:Broadcast/.test(g.action));
  const other = w.stated && differs;
  if (other) missing++;
  if (!g.whole && w.action !== 'wait' && w.subject) {
    if (g.subject !== w.subject) return null;
    if (w.written && !g.explicit) explicit = false;
  }
  if (w.directions.length && g.ways) {
    if (!g.direction) missing++;
    else if (!w.directions.includes(g.direction)) return null;
    else kept++;
  }
  for (const q of w.quantities) {
    if (q.kept) { kept++; continue; }
    const same = g.quantities.filter(x => x.unit === q.unit && (q.role === 'unknown' || x.role === q.role));
    if (same.length && !same.some(x => x.value === q.value)) return null;
    if (!same.length && g.quantities.some(x => x.unit === q.unit)) return null;
    if (!same.length) missing++;
    else kept++;
  }
  if (w.action && w.action !== 'wait' && g.quantities.some(x => x.unit === '秒' && !w.quantities.some(q => q.unit === '秒'))) return null;
  if (g.quantities.some(x => x.unit !== '秒' && w.quantities.some(q => q.unit === x.unit) && !w.quantities.some(q => q.unit === x.unit && q.value === x.value))) return null;
  if (!(g.action === 'turn' && !g.ways) && w.quantities.some(q => q.unit !== '秒') && g.quantities.some(x => x.unit !== '秒' && !w.quantities.some(q => q.unit === x.unit))) return null;
  if (w.strings.length && g.strings.some(v => !w.strings.includes(v)) || !w.quoted && g.said.some(v => v !== '' && !(w.raw || '').includes(v))) return null;
  missing += w.strings.filter(v => !g.strings.includes(v)).length;
  for (const v of w.strings) if (g.strings.includes(v)) { kept++; if (w.names?.includes(v)) named++; }
  if (w.objects.length && g.objects.length && !w.objects.some(o => g.objects.includes(o))) return null;
  if (w.objects.length && !g.objects.length) missing++;
  else if (w.objects.length) { kept++; named++; }
  return other && !kept || differs && named && kept === named ? null : { missing, explicit, nameOnly: named > 0 && kept === named };
}

export function assistMeaningMatch(want: AssistWant[] | null, got: AssistGot[] | null): AssistMeaning | null {
  if (!want || !got) return want && !got ? null : { missing: 0, explicit: true };
  if (want.length === 1 && !want[0].action) {
    const pairs = got.map(g => assistMeaningPair(want[0], g));
    return pairs.length && pairs.every(Boolean) ? { missing: Math.min(...pairs.map(p => p!.missing)), explicit: pairs.every(p => p!.explicit), nameOnly: pairs.every(p => p!.nameOnly), actions: [...new Set(got.map(g => g.action))].sort().join() } : null;
  }
  let missing = 0;
  let explicit = true;
  let j = 0;
  for (const w of want) {
    let g = got[j++];
    if (!g) return null;
    const either = ['move', 'turn'].includes(w.action) && w.quantities.find(q => q.unit === '秒' && q.role === 'unknown');
    let frame = w;
    if (either && g.action === 'wait' && got[j] && got[j].action !== 'wait') {
      if (g.quantities.find(x => x.unit === '秒')?.value !== either.value) return null;
      g = got[j++];
      frame = { ...w, quantities: w.quantities.map(q => q === either ? { ...q, kept: true } : q) };
    }
    const pair = assistMeaningPair(frame, g);
    if (!pair) return null;
    missing += pair.missing;
    explicit &&= pair.explicit;
  }
  return j === got.length ? { missing, explicit } : null;
}

export const ASSIST_FAMILY_WORDS = {
  SoundCommand: /音|鳴|なら|曲|メロディ|Hz|ヘルツ|歌|うた/,
  PenCommand: /ペン|ぺん|えんぴつ|鉛筆|クレヨン|マーカー|筆|ふで|線|かく(?!す|し|れ)|描|書|スタンプ|はんこ|ハンコ/,
  MotionCommand: /歩|\d+(?:ほ|ぽ)|進|すす|動|うご|行|い[くっき]|移動|いどう|走|はし|右|左|上|下|前|後|うしろ|向|む[くけ]|回|まわ|ところ|ばしょ|場所|位置|ジャンプ|跳|はね|戻|もど|方|よこ|たて|座標|飛|と[ぶん]/,
};
export const ASSIST_SAY_WORDS = /言|いう|いって|いった|いわ|話|はな[さしすせそ]|たず|尋|聞|きい|きく|質問|問|合図|あいず|送|おく[らりるれろっ]|知らせ|しらせ|メッセージ|叫|さけ|つぶや|呼|答|こた|返事|へんじ|セリフ|せりふ|ふきだし|吹き出し/;

export function assistFamiliesWritten(ast: Script, data: AssistData, nearest: Set<string>, dataOnly = false): boolean {
  // (a kind with no words of its own: undefined)
  const sounds = data.names.filter(n => n.kind === 'sound').map(n => n.name);
  const text = data.text.replace(/「[^「」]*」|『[^『』]*』/g, '');
  return assistNodes(ast.body).every(n => nearest.has(n.kind) ||
    (dataOnly || !(ASSIST_FAMILY_WORDS[n.kind as keyof typeof ASSIST_FAMILY_WORDS] as RegExp | undefined) || ASSIST_FAMILY_WORDS[n.kind as keyof typeof ASSIST_FAMILY_WORDS].test(text) || n.kind === 'SoundCommand' && sounds.some(name => data.text.includes(name))) &&
    !(ASSIST_DATA_KINDS.includes(n.kind) && n.target?.name && !data.text.includes(n.target.name)));
}

function assistTopicAt(text: string, ctx: AssistContext): ActorRef | null {
  const mark = 'あかりの目印';
  let said: AssistNode | undefined;
  try { said = assistNodes(parseSyntax(text + '「' + mark + '」と言う。', ctx).ast).find(n => n.kind === 'Say' && n.value?.value === mark); } catch { return null; }
  return said ? said.actorRef || { kind: 'self' } : null;
}

export function assistNextSubject(basis: string, start: number, end: number, written: string, indent: number, ctx: AssistContext, project: Project, topic: { before?: ActorRef | null }) {
  const owner = project.components.find(c => c.id === ctx.targetId)?.name;
  if (!owner) return null;
  let at = end;
  while (['。', ' ', '\t'].includes(basis[at])) at++;
  while (basis[at] === '\n') {
    const lineEnd = basis.indexOf('\n', at + 1);
    const line = basis.slice(at + 1, lineEnd < 0 ? basis.length : lineEnd);
    // (the pattern of the indent matches every line)
    if (line.trim() && !line.trim().startsWith('※')) {
      if (line.match(/^\s*/)![0].length !== indent) return null;
      at = at + 1 + indent;
      break;
    }
    at = lineEnd < 0 ? basis.length : lineEnd;
  }
  if (at >= basis.length || basis[at] === '\n') return null;
  const next = basis.slice(at).split('\n')[0].trim();
  try { if (readSentenceHeading(next.replace(/。$/, ''), ctx.symbols, null, ctx)) return null; } catch {}
  const names = [...project.components.map(c => c.name), '自分', 'みんな', '全体'].sort(assistLongestFirst).map(assistEscapeRegex).join('|');
  if (new RegExp('^「?(?:' + names + ')」?(?:は|が|も|だけ|、)').test(basis.slice(at))) return null;
  if (!('before' in topic)) topic.before = assistTopicAt(basis.slice(0, start), ctx);
  const after = assistTopicAt(basis.slice(0, start) + written + (basis[end] === '。' ? '。' : ''), ctx);
  const who = (r: ActorRef | null | undefined) => r?.kind === 'named' ? r.name : r?.kind === 'self' ? owner : null;
  if (!topic.before || !after || who(topic.before) === who(after)) return null;
  const subject = sentenceActorSource(who(topic.before) === owner ? { kind: 'self' } : topic.before) + (/^もし|、$|(?:くり返す|繰り返す|くりかえす)。?$/.test(next) ? 'は、' : 'は');
  return { at, between: basis.slice(end, at) + subject, note: `つぎの 文の はじめに「${subject}」を 書きます（つぎの 文は、これまでどおり ${who(topic.before)}が します）` };
}

export function assistProposalKeepsSubject(proposal: Proposal & { description?: string }, basis: unknown, ctx: AssistContext, project: Project): Proposal & { description?: string; note?: string } {
  if (typeof basis !== 'string' || typeof proposal?.source !== 'string' || proposal.input || !Number.isInteger(proposal.start) || !Number.isInteger(proposal.end)) return proposal;
  // (isInteger: the places are numbers; the pattern of the indent matches every line)
  const indent = basis.slice(basis.lastIndexOf('\n', proposal.start! - 1) + 1).match(/^[ \t]*/)![0].length;
  const kept = assistNextSubject(basis, proposal.start!, proposal.end!, proposal.source, indent, ctx, project, {});
  return kept ? { ...proposal, source: proposal.source + kept.between, end: kept.at, description: [proposal.description, kept.note].filter(Boolean).join(' '), note: kept.note } : proposal;
}

export function assistMeaningCompletions(text: string, want: AssistWant[] | null, parts: string[]): string[] {
  if (!want) return [];
  const lines = String(text).trim().replace(/。$/, '').split(/。?\n/);
  const merged = lines.length !== want.length;
  const main = merged ? want.filter((w, i) => !(w.action === 'wait' && want[i + 1] && want[i + 1].action !== 'wait')) : want;
  if (lines.length !== main.length || lines.some(line => /^\s/.test(line))) return [];
  let options = [''];
  for (const [i, line] of lines.entries()) {
    const w = main[i];
    const at = want.indexOf(w);
    const wait = merged && at > 0 && want[at - 1].action === 'wait' && w.action !== 'wait' ? want[at - 1].quantities[0]?.value : null;
    const head = /^([^、。「」]+?)(?:は|が)、?/.exec(line);
    const named = head && [...parts, '自分'].includes(head[1]);
    const subject = named ? head[0] : w.subject && w.action !== 'wait' ? w.subject + 'は' : '';
    const body = named ? line.slice(head[0].length) : line;
    const time = w.quantities.find(q => q.unit === '秒' && q.role !== 'wait');
    const ways: string[] = [];
    if (time && !/秒/.test(body) && ['move', 'turn'].includes(w.action)) {
      ways.push(time.value + '秒かけて、' + body);
      if (time.role === 'unknown' && wait == null) ways.push(time.value + '秒待ってから、' + body);
    } else {
      ways.push(body);
    }
    options = options.flatMap(prefix => ways.map(way => prefix + (i ? '\n' : '') + subject + (wait != null && !/待って/.test(way) ? wait + '秒待ってから、' : '') + way));
  }
  return options.filter(option => option.replace(/[\s。]/g, '') !== String(text).replace(/[\s。]/g, ''));
}

// Baseline Work-Check Memoization: the neutral checks depend only on (start, end), so they are computed once per span.
const ASSIST_NEUTRAL = ['何もしない。', 'もし1が1と同じなら、'];

export function assistWorkCheck(project: Project, basis: string, context: AssistContext & { key?: string; ownerKey?: string }, start: number, end: number, source: string, cache?: AssistWorkCheckCache): boolean {
  const ctx = assistVerificationContext({ ...context, symbols: context.symbols || buildSymbols(project) });
  const put = (text: string) => basis.slice(0, start) + text + basis.slice(end);
  const reads = new Map<string, ReturnType<typeof parseSyntax> | null>();
  const read = (text: string) => {
    if (!reads.has(text)) {
      try { reads.set(text, parseSyntax(text, ctx)); } catch { reads.set(text, null); }
    }
    return reads.get(text) ?? null;
  };
  const from = basis.slice(0, start).split('\n').length;
  const to = from + source.split('\n').length - 1;
  const whole = put(source);
  const parsed = read(whole);
  if (!parsed) return false;

  const head = start ? basis.lastIndexOf('\n', start - 1) + 1 : 0;
  const tail = basis.indexOf('\n', end);
  const lead = /^[ \t　]*/.exec(basis.slice(head))?.[0] ?? '';
  const line = (text: string) => basis.slice(0, head) + lead + text + (tail < 0 ? '' : basis.slice(tail));
  const upTo = (text: string, last: number) => {
    const lines = text.split('\n').slice(0, last);
    const closed = lines.join('\n');
    return [closed, closed + '\n' + (/^[ \t　]*/.exec(lines.at(-1) ?? '')?.[0] ?? '') + '  何もしない。'];
  };
  const said = (text: string, last: number): string[] | 'unchecked' | null => {
    let got = read(text);
    for (const part of got?.ast ? [] : upTo(text, last)) {
      got = read(part);
      if (got?.ast) break;
    }
    if (!got?.ast) return null;
    const definition = typeof context.definition === 'object' ? context.definition : null;
    const kind = context.definitionKind ?? null;
    const targetId = kind ? null : context.targetId ?? 'stage';
    const headings: Diagnostic[] = [];
    try {
      documentSyntaxItems(got.ast, 'script:near', { ownerId: targetId ?? 'stage', targetId, targetType: kind ? null : context.targetType ?? 'stage', event: kind ? null : context.event ?? 'start', args: context.args ?? [], definition, definitionKind: kind }, project, headings);
      return [...headings, ...analyzeAst(got.ast, project, { ...context, definition })].map(e => e.code + '\n' + e.message);
    } catch { return 'unchecked'; }
  };

  const spanKey = start + ':' + end;
  const getBaseline = (): AssistWorkCheckBaseline => {
    const hit = cache?.get(spanKey);
    if (hit) return hit;
    const reach = (text: string) => {
      const got = read(text);
      return !got ? 0 : got.ast ? Infinity : (got.syntaxDiagnostics[0]?.line ?? 0) - from;
    };
    let neutralReach = -Infinity;
    const neutralErrors: string[] = [];
    let neutralUnchecked = false;
    for (const neutral of ASSIST_NEUTRAL) {
      neutralReach = Math.max(neutralReach, reach(put(neutral)), reach(line(neutral)));
      const without = said(put(neutral), from);
      if (without === 'unchecked') neutralUnchecked = true;
      else if (Array.isArray(without)) neutralErrors.push(...without);
    }
    const baseline: AssistWorkCheckBaseline = { neutralReach, neutralErrors, neutralUnchecked };
    cache?.set(spanKey, baseline);
    return baseline;
  };

  if (!parsed.ast) {
    const next = parsed.syntaxDiagnostics[0];
    if (next && next.line > to) {
      const base = getBaseline();
      if (base.neutralReach > next.line - to) return false;
    }
  }

  const now = said(whole, to);
  if (!now) return false;
  if (now === 'unchecked') return getBaseline().neutralUnchecked;
  if (!now.length) return true;
  const base = getBaseline();
  for (const e of base.neutralErrors) {
    const at = now.indexOf(e);
    if (at >= 0) now.splice(at, 1);
  }
  return !now.length;
}

const ASSIST_CONDITION_WORDS = /たら|だら|なら|[えけげせてねべめれ]ば|(?<=[ただるいうくぐすつぬぶむの])(?:とき|時(?![間計刻点々]))|(?<=[うくぐすつぬぶむる])(?:と(?!言|い[うっいえわ]|話|はな[すしせそ]|たず|聞|き[くいかけこ]|思|おも|同じ|おなじ|ちが|比べ|くらべ|いっしょ|一緒|す[るれ]|し[たてよ]|[かもはのがをにでと]|、?。?$)|まで)|(?<=[るたい])(?:あいだ|間)/g;
const ASSIST_NOT_CONDITION = /あたらし|はたら[かきくけこい]|でたらめ|だらだら|だらけ|(?<=を)たら[すし]|(?<=を(?:[0-9０-９.．]+(?:秒|びょう|回|かい))?)なら[すしせそうっい]|(?<=[をにで])なら[べぶんび]|にならな|かならず|さよう?なら|たとえば|ばしょ|ばかり|ばん|ばい|ときどき|いつまで|(?:おわる|終わる|おえる|終える)まで|(?:秒|びょう)(?:間|かん)?(?:たつまで|たったら|たつと|すぎたら|すぎるまで|すぎると)|[そこあど]のとき|おとうと|いもうと|^すると|([ぁ-ん]{2})\1と/g;

export function assistConditionEnds(text: string, project: Project): number[] {
  const blank = (s: string) => '＿'.repeat(s.length);
  const names = [
    ...project.components,
    ...project.sounds,
    ...project.actions,
    ...project.functions,
    ...[project.projectData, ...project.components.map(c => c.localData)].flatMap(data => [...data?.variables || [], ...data?.lists || []]),
  ].map(n => n.name).filter(Boolean).sort((a, b) => b.length - a.length);
  let masked = text.replace(/「[^「」]*」|『[^『』]*』|【[^【】]*】/g, (s: string) => blank(s));
  for (const name of names) masked = masked.split(name).join(blank(name));
  return [...masked.replace(ASSIST_NOT_CONDITION, (s: string) => blank(s)).matchAll(ASSIST_CONDITION_WORDS)].slice(0, ASSIST_MAX_COND_ENDS).map(m => m.index + m[0].length);
}

const assistConditionRead = (written: string, project: Project, ctx: AssistContext) => assistConditionEnds(written, project).some(end => {
  const upTo = written.slice(0, end).replace(/^もし/, '');
  const before = upTo.replace(/の?(?:とき|時)$|(?:たら|だら|なら|と|まで|あいだ|間)$/, '');
  const own = project.components.find(c => c.id === ctx.targetId)?.localData;
  const known = new Set([...[project.projectData, own].flatMap(d => [...d?.variables || [], ...d?.lists || []]).map(n => n.name), ...(ctx.args || []), ...(ctx.localNames || [])]);
  return ['もし' + upTo + '、\n  何もしない。', 'もし' + before + (/た$/.test(before) ? 'ら' : 'なら') + '、\n  何もしない。'].some(source => {
    try {
      const condition = (parseSyntax(source, ctx).ast?.body?.[0] as { condition?: unknown } | undefined)?.condition;
      if (!condition) return false;
      let unknown = false;
      JSON.stringify(condition, (_key, value: unknown) => {
        if (value && typeof value === 'object' && ['VariableRead', 'ListRead'].includes((value as { kind?: string }).kind || '') && !known.has((value as { name?: string }).name || '')) unknown = true;
        return value;
      });
      return !unknown;
    } catch { return false; }
  });
});

const assistHeadingWaits = (heading: { event?: unknown; filter?: Record<string, unknown> }, written: string) =>
  !!heading.filter && Object.values(heading.filter).every(v => typeof v !== 'string' || written.includes(v) || heading.event === 'keyDown' && /キー|きー/.test(written));

export const assistKeepsCondition = (ast: Script, written: string, worded: boolean, project: Project | null = null, ctx: AssistContext | null = null) => {
  const headings: { event?: unknown; filter?: Record<string, unknown> }[] = [];
  const text = JSON.stringify(ast, (key, value: unknown) => {
    if (key === 'heading' && value && typeof value === 'object') headings.push(value as { event?: unknown; filter?: Record<string, unknown> });
    return key === 'sourceSpan' ? undefined : value;
  });
  if (text.includes('"op":"BOUNCE"')) return /はし|端|かべ|壁|はね|跳ね/.test(written);
  const held = /"condition":\{|"kind":"(?:WaitUntil|RepeatWhile|RepeatUntil|ContinuousRule)"/.test(text);
  if (!held && headings.length && project && ctx && !headings.every(h => assistHeadingWaits(h, written)) && assistConditionRead(written, project, ctx)) return false;
  return worded || held || headings.length > 0;
};

const ASSIST_OBJECT_WORDS: [RegExp, RegExp][] = [
  [/(?:合図|あいず).*(?:待|まつ|まって)/, /"kind":"(?:BroadcastAndWait|WaitBroadcastGroup)"/],
  [/合図|あいず/, /"kind":"(?:Broadcast|BroadcastAndWait|WaitBroadcastGroup)"|"event":"message"/],
  [/きょり|距離/, /"sensor":"DISTANCE_TO"/],
];
const ASSIST_REPEAT_WORDS = /ごとに|毎秒|たびに|ずっと(?!待|ま[つちっ])/;
const ASSIST_LIST_MUTATION_KINDS = ['ListAppend', 'ListInsert', 'ListReplace', 'ListDelete', 'ListClear'];

// Count executable statements in the AST (including statements inside block bodies).
function assistExecutableCount(ast: Script): number {
  let count = 0;
  const walk = (list: readonly AssistNode[] | undefined) => {
    for (const n of list || []) {
      if (!n || n.kind === 'CommentLine') continue;
      count++;
      if (Array.isArray(n.body)) walk(n.body as AssistNode[]);
      if (Array.isArray(n.thenBody)) walk(n.thenBody as AssistNode[]);
      if (Array.isArray(n.elseBody)) walk(n.elseBody as AssistNode[]);
    }
  };
  walk(ast.body as AssistNode[] | undefined);
  count += ast.rules?.length || 0;
  return count;
}

// 5 Semantic Preservation Obligations Gate:
// 1. Repetition & count preservation
// 2. Multi-clause coverage (no dropped tail clause)
// 3. Relative/absolute scale separation & sign/polarity consistency
// 4. Speech/observation vs list destructive mutation exclusion
// 5. No baseless 440Hz/speech defaults in multi-clause or non-tone synthesis
export function assistSemanticObligations(written: string, ast: Script | null, project: Project, ctx: AssistContext): boolean {
  if (!ast) return true;
  if (/^\s*(?:\/\/|／／|#|＃|--|\/\*|\*\s|※)/.test(written)) return true;
  const plain = assistNumberText(written).replace(/「[^「」]*」|『[^『』]*』|【[^【】]*】/g, q => '＿'.repeat(q.length));
  const nodes = assistNodes(ast.body);
  const tree = JSON.stringify(ast, (key, value: unknown) => key === 'sourceSpan' ? undefined : value);

  // 1. Repetition & count preservation
  const isBreakPhrase = /くり返しを(?:やめる|ぬける|抜ける|終える|おえる|止める|とめる)/.test(plain) || /このくり返しを終え/.test(plain);
  const repeatCountMatch = /(?<![一二三四五六七八九十\d])(\d+)回(?:くり返|繰返|くりかえ|する|行う|やる|実行|ループ|リピート)/.exec(plain) ||
    /(?:のを|ことを|これらを|これを|この(?:二つ|2つ|ふたつ|三つ|3つ|みっつ)を)(\d+)回/.exec(plain);
  if (!isBreakPhrase && repeatCountMatch) {
    const wantedCount = Number(repeatCountMatch[1]);
    if (wantedCount >= 2) {
      const repeats = nodes.filter(n => n.kind === 'RepeatCount');
      if (!repeats.length) return false;
      const matchesCount = repeats.some(r => {
        const c = r.count as { kind?: string; value?: { kind?: string; value?: number } | number } | undefined;
        const val = c?.kind === 'QuantityLiteral' && typeof c.value === 'object' ? c.value?.value : typeof c?.value === 'number' ? c.value : null;
        return val === wantedCount;
      });
      if (!matchesCount) return false;
    }
  }
  if (!isBreakPhrase && /くり返|繰返|くりかえ/.test(plain) && !/"kind":"(?:Forever|RepeatCount|RepeatWhile|RepeatUntil|ForEach)"/.test(tree)) return false;

  // 2. Multi-clause coverage: when two distinct action clauses are connected, do not drop the tail clause.
  const isCompoundSingle = /(?:たずね|聞[くいき]|き[くい]|質問|しつもん|言って|といい).*(?:答え|こたえ|返事)/.test(plain) ||
    /(?:合図.*(?:送|おく)|知らせて).*(?:待|まつ)/.test(plain) ||
    /答えにして返す|答えとして返す|をわたして|として、?/.test(plain) ||
    /かけて、?/.test(plain) ||
    /見て、?/.test(plain) ||
    /とばして/.test(plain) ||
    /止まって、/.test(plain) ||
    /おして(?:いる|いれ)|おされて(?:いる|いれ)|ふれて(?:いる|いれ|いな)|入って(?:いる|いれ|いな)|持って(?:いる|いれ|いな)/.test(plain);
  if (!isCompoundSingle) {
    const hasTwoActionClauses =
      /(?:進んでから|動いてから|回ってから|曲がってから|待ってから|ふやしてから|増やしてから|へらしてから|減らしてから|かえてから|変えてから|鳴らしてから|言ってから).{2,}/.test(plain) ||
      /(?:進んで|動いて|曲がって|ふやして|増やして|へらして|減らして)(?:、|\s*)(?!(?:ください|ね|よ|ほしい|くれ|いる|いれ|いな|いた|います|おく|おいて|しまう|から|$))[^。]{2,}/.test(plain);
    if (hasTwoActionClauses) {
      const hasLoop = /"kind":"(?:Forever|RepeatCount|RepeatWhile|RepeatUntil|ForEach)"/.test(tree);
      const execCount = assistExecutableCount(ast);
      // A loop wrapping 2 statements has execCount >= 3; a flat 2-statement sequence has execCount >= 2.
      const minExpected = hasLoop ? 3 : 2;
      // Allow single UserActionCall if the input uses a registered argument-setting phrasing (e.g. 長さを50にして四角をかく).
      const hasActionCall = nodes.some(n => n.kind === 'UserActionCall');
      if (execCount < minExpected && !hasActionCall) return false;
      // When the whole multi-clause sequence is wrapped in 〜のをN回くり返す, the loop must be the top-level wrapper
      // and contain at least 2 statements (never push the first clause outside the loop).
      if (/(?:のを|ことを)、?\d+回(?:くり返|繰返|くりかえ)/.test(plain)) {
        const top = ast.body?.[0] as AssistNode | undefined;
        const innerCount = Array.isArray(top?.body) ? (top!.body as AssistNode[]).filter(x => x?.kind !== 'CommentLine').length : 0;
        if (top?.kind !== 'RepeatCount' || innerCount < 2) return false;
      }
    }
  }

  // 3. Relative/absolute scale & volume separation, plus sign/polarity consistency
  type ScaleArgNode = { kind?: string; op?: string; value?: { kind?: string; op?: string } };
  const isRelativeScale = /(?<!音の)大きさ(?:を|が)\s*-?\d+(?:\.\d+)?(?:％|%|パーセント)?(?:ずつ)?(?:大きく|小さく|ふや|増や|へら|減ら)/.test(plain);
  if (isRelativeScale) {
    for (const n of nodes) {
      if (n.kind === 'LooksCommand' && n.op === 'SET_SCALE') {
        const arg0 = n.args?.[0] as ScaleArgNode | undefined;
        const inner: { kind?: string; op?: string } | undefined = arg0?.kind === 'QuantityLiteral' ? arg0.value : arg0;
        if (inner?.kind !== 'BinaryExpression') return false;
        if (/大きく|ふや|増や/.test(plain) && inner.op !== 'ADD') return false;
        if (/小さく|へら|減ら/.test(plain) && inner.op !== 'SUB') return false;
      }
    }
  }
  const isRelativeVolume = /(?:音の大きさ|音量)(?:を|が)\s*-?\d+(?:\.\d+)?(?:％|%|パーセント)?(?:ずつ)?(?:大きく|小さく|ふや|増や|へら|減ら|上げ|あげ|下げ|さげ)/.test(plain);
  if (isRelativeVolume) {
    for (const n of nodes) {
      if (n.kind === 'SoundCommand' && n.op === 'SET_VOLUME') {
        const arg0 = n.args?.[0] as ScaleArgNode | undefined;
        const inner: { kind?: string; op?: string } | undefined = arg0?.kind === 'QuantityLiteral' ? arg0.value : arg0;
        if (inner?.kind !== 'BinaryExpression') return false;
        if (/大きく|ふや|増や|上げ|あげ/.test(plain) && inner.op !== 'ADD') return false;
        if (/小さく|へら|減ら|下げ|さげ/.test(plain) && inner.op !== 'SUB') return false;
      }
    }
  }
  const signedX = /(?:[xXｘＸ]|横|よこ)(?:座標|ざひょう)?を(-?\d+(?:\.\d+)?)(?:ずつ)?(?:変える|かえる)/.exec(plain);
  if (signedX) {
    const v = Number(signedX[1]);
    const wantDir = v < 0 ? 'left' : 'right';
    if (nodes.some(n => n.kind === 'MotionCommand' && n.op === 'MOVE_BY' && n.xDir !== wantDir)) return false;
  }
  const signedY = /(?:[yYｙＹ]|縦|たて)(?:座標|ざひょう)?を(-?\d+(?:\.\d+)?)(?:ずつ)?(?:変える|かえる)/.exec(plain);
  if (signedY) {
    const v = Number(signedY[1]);
    const wantDir = v < 0 ? 'down' : 'up';
    if (nodes.some(n => n.kind === 'MotionCommand' && n.op === 'MOVE_BY' && n.yDir !== wantDir)) return false;
  }

  // Negation polarity in conditions: if input explicitly negates a condition, reject affirmative-only condition.
  const hasExplicitNegation = /(?:ふれていなければ|ふれていなかったら|ふれていないなら|ふれてなければ|さわっていなかったら|入っていなければ|はいっていなければ|がなければ|がなかったら|がないなら|でなければ|じゃなければ|じゃなかったら|とちがう|と違う)/.test(plain);
  if (hasExplicitNegation && !/(?:の倍数|の約数)/.test(plain)) {
    const hasNegInAst = /"op":"(?:NOT|NEQ)"/.test(tree) || /"kind":"(?:IfStatement|RepeatWhile|RepeatUntil|WaitUntil)"/.test(tree) && /"op":"(?:LT|LTE|GT|GTE)"/.test(tree);
    if (!hasNegInAst) return false;
  }

  // 4. Speech/observation vs list destructive mutation exclusion
  const hasSpeechVerb = /(?:言う|いう|話す|はなす|しゃべ|表示|ひょうじ|見せる|みせる)/.test(plain);
  const hasListMutationVerb = /(?:入れ|いれ|追加|ついか|挿入|そうにゅう|かえ|変え|置き換|おきか|交換|こうかん|消|けす|けし|削除|さくじょ|取り出|とりだ|クリア|くりあ|すて|捨)/.test(plain);
  if (hasSpeechVerb && !hasListMutationVerb) {
    if (nodes.some(n => ASSIST_LIST_MUTATION_KINDS.includes(n.kind))) return false;
  }

  // 5. Registered procedure priority & baseless default text suppression:
  // When input explicitly names a registered action without directional steps, do not replace it with a generic motion/pen action.
  const explicitMotionStep = /(?:右|左|上|下|前|後ろ|うしろ)(?:へ|に)?\s*\d+(?:\.\d+)?(?:歩|ほ|ぽ)/.test(plain);
  if (!explicitMotionStep) {
    const namedAction = (project.actions || []).find(a => a.name && plain.includes(a.name));
    if (namedAction && !nodes.some(n => n.kind === 'UserActionCall' && n.name === namedAction.name)) {
      if (nodes.some(n => n.kind === 'MotionCommand' || n.kind === 'PenCommand')) return false;
    }
  }
  // Reject invented string literals on UI text/input setters when the input contains no quoted string and does not mention that text.
  if (!/[「」『』"‘’]/.test(written)) {
    for (const n of nodes) {
      if (n.kind === 'LooksCommand' && (n.op === 'SET_TARGET_TEXT' || n.op === 'SET_INPUT')) {
        const val = n.args?.[1];
        if (val?.kind === 'StringLiteral' && typeof val.value === 'string' && val.value && !written.includes(val.value)) return false;
      }
    }
  }
  // Reject ReturnStatement in function bodies when the child wrote speech verbs (言う/話す) without 返す/答え.
  if (ctx.definitionKind === 'function' && hasSpeechVerb && !/(?:返す|かえす|答え|こたえ)/.test(plain)) {
    if (nodes.some(n => n.kind === 'ReturnStatement')) return false;
  }

  return true;
}

export function assistKeepsWritten(project: Project, written: string, text: string, ast: Script | null, ctx: AssistContext): boolean {
  const tree = ast ? JSON.stringify(ast, (key, value: unknown) => key === 'sourceSpan' ? undefined : value) : '';
  const own = project.components.find(c => c.id === ctx.targetId)?.localData;
  let plain = written.replace(/「[^「」]*」|『[^『』]*』|【[^【】]*】/g, (q: string) => '＿'.repeat(q.length));
  const names: string[] = [];
  for (const name of [project.projectData, own].flatMap(d => [...d?.variables || [], ...d?.lists || []]).map(n => n.name).filter(Boolean).sort((a, b) => b.length - a.length)) {
    if (plain.includes(name)) {
      if (plain.includes(name + 'の') || plain.includes(name + 'を')) names.push(name);
      plain = plain.split(name).join('＿'.repeat(name.length));
    }
  }
  if (!names.every(name => text.includes(name))) return false;
  if (/すがた|コスチューム|はいけい|背景/.test(plain) && ast && assistNodes(ast.body).some(n => ASSIST_DATA_KINDS.includes(n.kind) && n.target?.name && !written.includes(n.target.name))) return false;
  if (!ASSIST_OBJECT_WORDS.every(([word, kept]) => !word.test(plain) || kept.test(tree))) return false;
  if (ASSIST_REPEAT_WORDS.test(plain) && !/"kind":"(?:Forever|RepeatCount|RepeatWhile|RepeatUntil|ContinuousRule|ForEach)"|"heading":\{/.test(tree)) return false;
  const ends = assistConditionEnds(written, project);
  if ((/^もし/.test(written) || ends.length) && (!ast || !assistKeepsCondition(ast, written, assistConditionEnds(text, project).length > 0, project, ctx))) return false;
  if (!assistSemanticObligations(written, ast, project, ctx)) return false;
  return true;
}

// Something done until then (星にふれるまで右に動く, not 〜まで待つ, 〜まで止まる or 〜まで alone).
export const assistDoneUntil = (written: string, project: Project) =>
  assistConditionEnds(written, project).some(at => written.slice(at - 2, at) === 'まで' && /^、?\s*[^。\s]/.test(written.slice(at)) && !/^、?\s*(?:ずっと)?(?:待|ま[つちっ]|止ま|とま)/.test(written.slice(at)));
