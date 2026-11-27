import { keySurface } from './02-language-contracts.ts';
import { parseSyntax } from './04-syntax-expressions.ts';
import { KEY_ALIASES, KEY_WORDS, SENTENCE_TE_FORMS, keyWord } from './04-syntax-sentences.ts';
import { formatScript } from './06-source-formatting.ts';
import { WORD_LINES } from './07-semantic-analysis-core.ts';
import { searchReading } from './09-editor-sessions.ts';
import { BLOCK_SEARCH_SYNONYMS, searchQueryVariants } from './09-editor-search-core.ts';
import type { AssistCanonical, AssistContext, AssistData, AssistLatticeVariant, AssistListed, AssistName, AssistNameKind, AssistNode, AssistNumber, AssistPiece, AssistRange, AssistRunState, AssistSeed, AssistWorkCheckBaseline } from '../types/assist.d.ts';
import type { Symbols } from '../types/compiled.d.ts';
import type { Project } from '../types/project.d.ts';
import type { Script } from '../types/syntax.d.ts';

// ────────────────────────────────────────────────────────────────────────
// 09 — Code assist stage 0: token protection lattice and normalization
// ────────────────────────────────────────────────────────────────────────

export const ASSIST_MAX=4,ASSIST_FULL_PARSE_CHARS=4000,ASSIST_BUDGET_MS=300;
export const ASSIST_NORM_PASSES = 3;
export const ASSIST_MAX_DEPTH = 2;
export const ASSIST_MAX_CLAUSES = 4;
export const ASSIST_MAX_SKELETONS = 16;
export const ASSIST_MAX_PARSES = 64;
export const ASSIST_MAX_LINE_CHARS = 300;
export const ASSIST_MAX_COND_ENDS = 8;

export const ASSIST_DATA_KINDS = ['Assignment', 'NumericUpdate', 'ListAppend', 'ListInsert', 'ListReplace', 'ListDelete', 'ListClear'];
export const ASSIST_PART_VERBS = /(?:回|まわ)(?:す|して)|(?:進|すす)(?:める|めて)|(?:移|うつ)(?:す|して)|(?:向|む)(?:ける|けて)|(?:隠|かく)(?:す|して)|(?:見|み)(?:せる|せて)|(?:に|く)(?:する|して)/;
export const assistLongestFirst = (a: string, b: string) => b.length - a.length;

export function assistEscapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function assistCreateRunState(): AssistRunState {
  return {
    parsesRemaining: ASSIST_MAX_PARSES,
    templateCache: new Map<string, AssistCanonical | null>(),
    workCheckCache: new Map<string, AssistWorkCheckBaseline>(),
  };
}

// Stage 0 entry eligibility: P201, P205, S317, and WORD_LINES-derived S301 (arithmetic/empty words only).
export function assistDiagnosticEligible(diagnostic: { readonly code?: string; readonly line?: number } | null | undefined, basis: string): boolean {
  if (!diagnostic || !diagnostic.line || !diagnostic.code) return false;
  if (['P201', 'P205', 'S317'].includes(diagnostic.code)) return true;
  if (diagnostic.code !== 'S301') return false;
  const line = String(basis).replace(/\r\n?/g, '\n').split('\n')[diagnostic.line - 1] || '';
  return WORD_LINES.some(([pattern]) => pattern.test(line));
}

export function assistSplit(text: string, separators = '、。'): AssistPiece[] {
  const out: AssistPiece[] = [];
  let start = 0;
  const stack: string[] = [];
  const pairs = { '「': '」', '【': '】', '（': '）', '(': ')', '『': '』', '｢': '｣', '［': '］' };
  for (let i = 0; i < text.length; i++) {
    // (a character that opens nothing: undefined)
    const c = text[i];
    if (pairs[c as keyof typeof pairs] as string | undefined) stack.push(pairs[c as keyof typeof pairs]);
    else if (stack.at(-1) === c) stack.pop();
    else if (!stack.length && separators.includes(c)) {
      out.push({ text: text.slice(start, i), start, end: i });
      start = i + 1;
    }
  }
  out.push({ text: text.slice(start), start, end: text.length });
  return out.filter(x => x.text.trim());
}

// Protect quoted literals and optional registered symbols with PUA sentinels so literal § characters survive untouched.
const ASSIST_QUOTE_PATTERN = /「[^「」]*」|【[^【】]*】|『[^『』]*』|｢[^｢｣]*｣|["‘’][^"‘’]*["‘’]|（[^（）]*）|\([^()]*\)|〈[^〈〉]*〉|《[^《》]*》|［[^［］]*］|\[[^\[\]]*\]|\uE000|\uE001/g;

export function assistCollectSymbols(symbols: Symbols | null | undefined, ctx: AssistContext = {}): AssistName[] {
  const project = symbols?.project;
  const components = project?.components || [];
  const names: AssistName[] = [];
  const addNames = (values: readonly { name?: string }[] | undefined, kind: AssistNameKind) => {
    for (const v of values || []) if (v?.name) names.push({ name: v.name, kind });
  };
  addNames(components, 'part');
  addNames(project?.sounds, 'sound');
  addNames(project?.stage?.backdrops, 'backdrop');
  addNames(project?.projectData?.variables, 'variable');
  addNames(project?.projectData?.lists, 'list');
  addNames(project?.actions, 'action');
  addNames(project?.functions, 'function');
  for (const c of components) {
    if (c.id === ctx.targetId) {
      addNames(c.costumes, 'costume');
      addNames(c.localData?.variables, 'variable');
      addNames(c.localData?.lists, 'list');
    }
  }
  addNames((ctx.args || []).map(name => ({ name })), 'argument');
  addNames([...(ctx.localNames || [])].map(name => ({ name })), 'local');
  return names;
}

function assistProtect(text: string, extraTokens: readonly string[] = []): { masked: string; restore: (source: string) => string } {
  const tokens: string[] = [];
  let masked = text.replace(ASSIST_QUOTE_PATTERN, (segment: string) => '\uE000' + (tokens.push(segment) - 1) + '\uE001');
  if (extraTokens.length) {
    const sorted = [...new Set(extraTokens.filter(Boolean))].sort(assistLongestFirst);
    if (sorted.length) {
      const pattern = new RegExp(sorted.map(assistEscapeRegex).join('|'), 'g');
      masked = masked.replace(pattern, (segment: string) => '\uE000' + (tokens.push(segment) - 1) + '\uE001');
    }
  }
  const restore = (source: string) => source.replace(/\uE000(\d+)\uE001/g, (_: string, i: `${number}`) => tokens[i] ?? '');
  return { masked, restore };
}

export function assistNumberText(text: unknown): string {
  // PUA sentinels keep any § written in the source unchanged (§0§ stays §0§, §１§ becomes §1§).
  const { masked, restore } = assistProtect(String(text));
  let s = masked.normalize('NFKC').replace(/(?<=\d),(?=\d{3})/g, '');
  s = s.replace(/じゅっ|じゅう|きゅう|はち|なな|ろく|ご|よん|し|さん|に|いち/g, (m: string, at: number, full: string) => {
    // Kana numbers are quantities only immediately before a known unit.
    if (at && !/[はがをにへとで、 ]$/.test(full.slice(0, at))) return m;
    if (!/^(?:びょう|秒|歩|ほ|ぽ|回|かい|度|ど|つ(?!づ)|番)/.test(full.slice(at + m.length))) return m;
    // (the pattern takes only the words of the table)
    return ({ じゅっ: '10', じゅう: '10', きゅう: '9', はち: '8', なな: '7', ろく: '6', ご: '5', よん: '4', し: '4', さん: '3', に: '2', いち: '1' } as { readonly [word: string]: string })[m];
  });
  s = s.replace(/[一二三四五六七八九十百千]+(?=歩|秒|度|％|回|番|つ|個|体|匹|人|こ|点)/g, (word: string, at: number, full: string) => {
    if (word === '一' && /^番(?:手前|前|奥|おく|後ろ|うしろ|上|下)/.test(full.slice(at + word.length))) return word;
    // (a digit is in no table of units: undefined)
    const digits = '〇一二三四五六七八九';
    const units = { 十: 10, 百: 100, 千: 1000 };
    let total = 0;
    let n = 0;
    for (const c of word) {
      if (units[c as keyof typeof units] as number | undefined) {
        total += (n || 1) * units[c as keyof typeof units];
        n = 0;
      } else {
        n = digits.indexOf(c);
      }
    }
    return String(total + n);
  });
  return restore(s);
}

// Inspect registered variables to tell unitless numeric variables from string-initialized variables.
function assistVariableValueKinds(symbols: Symbols | null | undefined, ctx: AssistContext): { unitlessNumeric: Set<string>; textVars: Set<string> } {
  const project = symbols?.project;
  const unitlessNumeric = new Set<string>();
  const textVars = new Set<string>();
  const owner = project?.components.find(c => c.id === ctx.targetId);
  const allVars = [...(project?.projectData?.variables || []), ...(owner?.localData?.variables || [])];
  for (const v of allVars) {
    if (!v?.name) continue;
    const init = v.initialValue;
    if (typeof init === 'number') {
      unitlessNumeric.add(v.name);
    } else if (typeof init === 'string') {
      if (/^-?\d+(?:\.\d+)?$/.test(init.trim())) unitlessNumeric.add(v.name);
      else textVars.add(v.name);
    }
  }
  return { unitlessNumeric, textVars };
}

function assistNormalizePass(text: string, symbols: Symbols | null | undefined, ctx: AssistContext, protectBound: boolean): string {
  const project = symbols?.project;
  const allNames = assistCollectSymbols(symbols, ctx);
  const allTokenNames = protectBound ? allNames.map(n => n.name) : [];
  const { unitlessNumeric, textVars } = assistVariableValueKinds(symbols, ctx);
  const partNames = (project?.components || []).map(c => c.name).sort(assistLongestFirst);
  const listNames = allNames.filter(n => n.kind === 'list').map(n => n.name).sort(assistLongestFirst);
  const knownIdentifiers = new Set(allNames.map(n => n.name));

  // First pass on numbers with quote protection (and bound symbol protection when enabled).
  let s = text;
  if (protectBound && allTokenNames.length) {
    const held = assistProtect(s, allTokenNames);
    const numNorm = assistNumberText(held.masked);
    s = held.restore(numNorm);
  } else {
    s = assistNumberText(s);
  }

  // Strip counters after comparison numbers ONLY when the left-hand variable is a registered unitless numeric variable.
  if (unitlessNumeric.size) {
    const varAlts = [...unitlessNumeric].sort(assistLongestFirst).map(assistEscapeRegex).join('|');
    const heldVars = assistProtect(s);
    const stripped = heldVars.masked.replace(
      new RegExp('(' + varAlts + ')が(-?\\d+(?:\\.\\d+)?)(?:点|てん|個|こ|回|かい|人|匹|体|枚|本|冊|円|歩|ほ|ぽ|秒|びょう|度|ど|％|%|パーセント)(?=以上|以下|未満|みまん|より|と|なら|にな|を(?:こえ|超え)|だっ|でな|じゃ)', 'g'),
      '$1が$2'
    );
    s = heldVars.restore(stripped);
  }

  // Quote bare words on the right-hand side of comparisons against 答え or text-initialized variables.
  {
    const textTargets = ['答え', ...[...textVars].sort(assistLongestFirst)].map(assistEscapeRegex).join('|');
    const heldQuotes = assistProtect(s);
    const rhsTail = /(?=(?:なら|だったら|と同じ|でなければ|でないなら|ではないなら|じゃない|とちがう|と違う))/.source;
    const quoted = heldQuotes.masked.replace(
      new RegExp('((?:もし、?)?(?:' + textTargets + ')が)([^\\s「」『』【】、。\\uE000\\uE001]+?)' + rhsTail, 'g'),
      (whole: string, head: string, rhs: string) => {
        if (/^-?\d+(?:\.\d+)?$/.test(rhs) || knownIdentifiers.has(rhs)) return whole;
        if (/^(?:空|からっぽ|カラッポ|空っぽ|偶数|奇数|より|以上|以下|未満)$/.test(rhs) || /の(?:倍数|約数)$/.test(rhs)) return whole;
        return head + '「' + rhs + '」';
      }
    );
    s = heldQuotes.restore(quoted);
  }

  // Protect quotes and (in bound-first mode) registered symbols for general wording normalization.
  const { masked, restore } = assistProtect(s, allTokenNames);
  let m = masked;

  // Scratch-style signed coordinate changes: x座標を-10ずつ変える -> いまのばしょから、左へ10歩動く.
  m = m.replace(/(?:[xXｘＸ]|横|よこ)(?:座標|ざひょう)?を(-?\d+(?:\.\d+)?)(?:ずつ)?(?:変える|かえる)/g, (_: string, num: string) => {
    const v = Number(num);
    if (!Number.isFinite(v)) return _;
    return 'いまのばしょから、' + (v < 0 ? '左' : '右') + 'へ' + Math.abs(v) + '歩動く';
  });
  m = m.replace(/(?:[yYｙＹ]|縦|たて)(?:座標|ざひょう)?を(-?\d+(?:\.\d+)?)(?:ずつ)?(?:変える|かえる)/g, (_: string, num: string) => {
    const v = Number(num);
    if (!Number.isFinite(v)) return _;
    return 'いまのばしょから、' + (v < 0 ? '下' : '上') + 'へ' + Math.abs(v) + '歩動く';
  });

  // Comparison, negation, and key spellings.
  m = m.replace(/(右|左|上|下)の?(?:矢印|やじるし)キー/g, '「$1」キー');
  m = m.replace(/(?<![「」])(スペース|エンター|リターン|エスケープ)キー/g, '「$1」キー');
  m = m.replace(/(?:未満|みまん)(?:なら|だったら|のとき(?:は)?)/g, 'より小さければ');
  m = m.replace(/(?:未満|みまん)/g, 'より小さい');
  m = m.replace(/より(?:少なかったら|少ないなら|少ないとき(?:は)?)/g, 'より小さければ');
  m = m.replace(/より少ない/g, 'より小さい');
  m = m.replace(/より(?:多かったら|多いなら|多いとき(?:は)?)/g, 'より大きければ');
  m = m.replace(/より多い/g, 'より大きい');
  m = m.replace(/を(?:こえ|超え)(?:たら|るなら|たとき(?:は)?)/g, 'より大きければ');
  m = m.replace(/を(?:こえ|超え)る/g, 'より大きい');
  m = m.replace(/と同じなら/g, 'なら');
  m = m.replace(/(?:ふれ|触れ|さわ|触)(?:て|って)いなかったら/g, 'ふれていなければ');
  m = m.replace(/(?:ふれ|触れ|さわ|触)(?:て|って)いないなら/g, 'ふれていなければ');
  m = m.replace(/(?:ふれ|触れ|さわ|触)てなければ/g, 'ふれていなければ');
  m = m.replace(/(?:ふれ|触れ)なかったら/g, 'ふれていなければ');

  s = restore(m);

  // List non-membership: 持ち物に「かさ」がなければ -> 持ち物に「かさ」が入っていなければ.
  if (listNames.length) {
    const listAlts = listNames.map(assistEscapeRegex).join('|');
    const listNegTail = /(?:の中)?に(「[^「」]+」)が(?:なければ|なかったら|ないなら|はいっていなければ|入っていなければ|はいっていなかったら|入っていなかったら)/.source;
    const listPosTail = /(?:の中)?に(「[^「」]+」)が(?:あれば|あったら|あるなら|はいっていれば|入っていれば)/.source;
    s = s.replace(new RegExp('(' + listAlts + ')' + listNegTail, 'g'), (_: string, g1: string, g2: string) => g1 + 'に' + g2 + 'が入って' + 'いなけ' + 'れば');
    s = s.replace(new RegExp('(' + listAlts + ')' + listPosTail, 'g'), (_: string, g1: string, g2: string) => g1 + 'に' + g2 + 'が入って' + 'いれば');
  }

  // Quote bare registered part names before touch verbs (星にふれるまで -> 「星」にふれるまで).
  if (partNames.length) {
    const partAlts = partNames.map(assistEscapeRegex).join('|');
    const heldTouch = assistProtect(s);
    const touchLead = /(^|[、はがをにへとで\s]|もし)/.source;
    const touchLook = /(?=に(?:ふれ|触れ|さわ|触|あた|当|ぶつか))/.source;
    const quotedTouch = heldTouch.masked.replace(new RegExp(touchLead + '(' + partAlts + ')' + touchLook, 'g'), '$1「$2」');
    s = heldTouch.restore(quotedTouch);
  }

  return s;
}

// Two-layer fixed-point normalization lattice (bound-first stream + general stream), bounded by ASSIST_NORM_PASSES.
export function assistNormalizeLattice(text: string, symbols: Symbols | null | undefined, ctx: AssistContext = {}): AssistLatticeVariant[] {
  const run = (protectBound: boolean): string => {
    let cur = text;
    for (let pass = 0; pass < ASSIST_NORM_PASSES; pass++) {
      const next = assistNormalizePass(cur, symbols, ctx, protectBound);
      if (next === cur) break;
      cur = next;
    }
    return cur;
  };
  const bound = run(true);
  const general = run(false);
  const out: AssistLatticeVariant[] = [{ text: bound, boundFirst: true }];
  if (general !== bound) out.push({ text: general, boundFirst: false });
  return out;
}

export function assistListedSubjects(text: string, project: Project | null | undefined): AssistListed | null {
  const names = [...(project?.components || []).map(c => c.name), '自分'].sort(assistLongestFirst).map(assistEscapeRegex).join('|');
  const m = new RegExp('^((?:「?(?:' + names + ')」?(?:と|、|も|や))+「?(?:' + names + ')」?)(は|が|も|を|に)、?(?:いっしょに|一緒に|ともに|みんなで|みんな|ふたりで|二人で)?、?(.+)$').exec(text);
  // Parts named in a heading (ねこと犬がふれたとき、) are what happens, not who does it.
  if (!m || /とき|たら|ごとに|たびに/.test(m[3])) return null;
  // A part written twice (ねことねこは) is that one part.
  const parts = [...new Set([...m[1].matchAll(new RegExp('「?(' + names + ')」?', 'g'))].map(x => x[1]))];
  const made = ['を', 'に'].includes(m[2]);
  if (made && !/させ|せる|せて|かす|かして|かせ/.test(m[3]) && !(m[2] === 'を' && ASSIST_PART_VERBS.test(m[3])) || m[2] === 'に' && /知らせ|しらせ|見せ|みせ/.test(m[3])) return null;
  return { parts, particle: made ? m[2] : 'は', rest: m[3] };
}

export function assistSeeds(code: unknown, symbols: Symbols | null | undefined, ctx: AssistContext = {}): AssistData {
  const project = symbols?.project;
  const components = project?.components || [];
  const names = assistCollectSymbols(symbols, ctx);
  let text = assistNumberText(String(code).trim().replace(/[。、，．…〜♪]+$/u, ''));
  let subject: string | null = null;
  const listed = assistListedSubjects(text, project);
  for (const name of ['自分', '体', ...components.map(c => c.name)].sort((a, b) => b.length - a.length)) {
    const escaped = assistEscapeRegex(name);
    const m = new RegExp('^(?:「' + escaped + '」|' + escaped + ')(?:[はが]、?|[、\\s]+|の(?=向き|大きさ|すがた|音|色|ばしょ|文字|中身|見た目|ペン))').exec(text);
    if (m) {
      subject = name;
      text = text.slice(m[0].length);
      break;
    }
  }
  // (one of the patterns' groups is the quoted text)
  const stringValues = [...text.matchAll(/「([^「」]*)」|『([^『』]*)』|｢([^｢｣]*)｣|["‘’]([^"‘’]*)["‘’]|（([^（）]*)）|\(([^()]*)\)|〈([^〈〉]*)〉|《([^《》]*)》|［([^［］]*)］|\[([^\[\]]*)\]/g)]
    .map(m => ({ value: m.slice(1).find(x => x !== undefined) as string, at: m.index, end: m.index + m[0].length }));
  const strings = stringValues.map(s => s.value);
  const nameText = text.replace(/^もし、?/, '');
  const extractedNames = names.filter(n =>
    strings.includes(n.name) ||
    text.includes('【' + n.name + '】') ||
    new RegExp('(?:^|[はがをにへとので、 ])' + assistEscapeRegex(n.name) + '(?:$|[はがをにへとので、 ])').test(nameText)
  );
  for (const name of names.filter(n => ['action', 'function'].includes(n.kind))) {
    if (!extractedNames.includes(name) && new RegExp(assistEscapeRegex(name.name) + '(?:させ|する|して|という)').test(text)) extractedNames.push(name);
  }
  if (text.includes('マウス')) extractedNames.push({ name: 'マウス', kind: 'part' });
  let outside = text;
  for (const s of stringValues) outside = outside.slice(0, s.at) + ' '.repeat(s.end - s.at) + outside.slice(s.end);
  outside = outside.replace(/【[^【】]*】/g, s => ' '.repeat(s.length));
  const keys = [...new Set(strings.map(keyWord).filter(Boolean))];
  for (const word of [...Object.keys(KEY_ALIASES), ...KEY_WORDS].sort((a, b) => b.length - a.length)) {
    const escaped = assistEscapeRegex(word);
    if (new RegExp('(?:^|の)' + escaped + '(?:矢印キー|やじるしキー|キー|(?=[をが]))').test(outside)) {
      const key = keyWord(word);
      if (key && !keys.includes(key)) keys.push(key);
    }
  }
  const numbers: AssistNumber[] = [];
  const unitNames = { 歩: '歩', ほ: '歩', ぽ: '歩', ホ: '歩', ドット: '歩', step: '歩', ステップ: '歩', 秒: '秒', びょう: '秒', s: '秒', sec: '秒', 度: '度', ど: '度', '°': '度', '%': '％', '％': '％', パーセント: '％', ぱーせんと: '％', パー: '％', Hz: 'Hz', hz: 'Hz', HZ: 'Hz', ヘルツ: 'Hz', 回: '回', かい: '回', 番目: '番目', 番め: '番目', ばんめ: '番目', つ目: '番目', つめ: '番目', こめ: '番目', 個目: '番目', 番: '番目', 段: '段階', 段階: '段階', つ: 'つ', こ: 'つ', 個: 'つ', 層: 'つ', 体: 'count', 匹: 'count', 人: 'count', px: null, ピクセル: null };
  for (const m of outside.matchAll(/(-?\d+(?:\.\d+)?)([A-Za-z%％°ァ-ヶぁ-ゖ一-龯]*)(?:半|はん)?/g)) {
    const unit = Object.keys(unitNames).sort((a, b) => b.length - a.length).find(u => m[2].startsWith(u));
    if (m[2] && !unit && !/^(?:[をにへとでがは]|から|まで|より|なら)/.test(m[2]) && !searchQueryVariants(m[2]).some(form => (Object.values(BLOCK_SEARCH_SYNONYMS).flat() as string[]).some(word => form.startsWith(word)))) continue;
    const suffix = outside.slice(m.index + m[1].length + (unit?.length || 0));
    // (the unit is a key of the table)
    numbers.push({ value: Number(m[1]) + (/^(?:半|はん)/.test(suffix) && (!unit || unitNames[unit as keyof typeof unitNames] === '秒') ? 0.5 : 0), unit: unit ? unitNames[unit as keyof typeof unitNames] : null, at: m.index, end: m.index + m[1].length });
  }
  let clauseText = '';
  const stack: string[] = [];
  const pairs = { '「': '」', '【': '】', '『': '』', '｢': '｣' };
  const teWords = [...SENTENCE_TE_FORMS].map(([te]) => te).sort((a, b) => b.length - a.length);
  for (let i = 0; i < text.length; i++) {
    // (a character that opens nothing: undefined)
    const c = text[i];
    if (pairs[c as keyof typeof pairs] as string | undefined) stack.push(pairs[c as keyof typeof pairs]);
    else if (stack.at(-1) === c) stack.pop();
    clauseText += c;
    if (stack.length) continue;
    const before = text.slice(0, i + 1);
    const after = text.slice(i + 1);
    if (/^[、。]/.test(after) || !after) continue;
    if ((teWords.some(te => before.endsWith(te)) && !/^(?:ください|ね|よ|ほしい|くれ|いる|いれ|いな|いた|います|おく|おいて|しまう)/.test(after)) || /[てで]$/.test(before) && after.startsWith('から')) clauseText += '、';
    else if (/[うくぐすつぬぶむる]$/.test(before) && after.startsWith('そして')) clauseText += '、';
  }
  const clauses = assistSplit(clauseText, '、').map(x => ({ ...x, text: x.text.replace(/^(?:から|そして|それから|それで|つぎに|次に)/, '') }));
  // Parts written together after a clause (…して、ねこと犬は…) do only that clause, which no sentence for each keeps.
  const subjects = listed ?? (clauses.slice(1).some(c => assistListedSubjects(c.text, project)) ? { parts: [], particle: 'は', rest: null } : null);
  const seeds: AssistSeed[] = [];
  const seen = new Set<string>();
  const add = (word: string, rank: number, fragment = false) => {
    word = word.trim();
    if (!word || seen.has(word) || /^(?:する|なる|ある|いる|それ|これ|あれ|となり|少し)$/.test(word)) return;
    seen.add(word);
    seeds.push({ text: word, rank, fragment });
  };
  for (const [raw, rank] of [[text, 0] as const, ...clauses.map((c, i) => [c.text, i === clauses.length - 1 ? 1 : i + 2] as const)]) {
    const clean = raw.replace(/「[^「」]*」|『[^『』]*』|｢[^｢｣]*｣|"[^"]*"/g, '');
    add(clean, rank);
    add(clean.replace(/(?:をする|をやる|する)$/, ''), rank);
    for (const v of searchQueryVariants(clean, { condition: /(?:たら|と|れば|なら|とき|たとき|あいだ|間|まで)$/.test(clean) })) add(v, rank);
    for (const m of clean.matchAll(/(?:^|[、])(.+?)[をはが]/g)) add(m[1], rank);
    for (const word of [clean, ...searchQueryVariants(clean)].flatMap(form => form.replace(/\d+(?:\.\d+)?(?:cm|センチ|メートル|マス|ぽ|ほ)/g, '').replace(/という|として|とともに|といっしょに/g, m => m.replace(/と/g, '\u0002')).split(/[をにへとでがはの、\d]+|歩|秒|度|％|回|番目/))) {
      const w = word.replace(/\u0002/g, 'と');
      add(w, rank, true);
      add(w.replace(/(?:をする|をやる|する)$/, ''), rank, true);
      for (const v of searchQueryVariants(w)) add(v, rank, true);
    }
  }
  for (const m of text.matchAll(/【([^【】]+)】/g)) add(m[1], 0, true);
  for (const key of keys) add(keySurface(key), 0, true);
  for (const number of numbers) if (number.unit) add(String(number.value) + number.unit, 0, true);
  // (each block in the table has its words)
  for (const word of new Set(Object.values(BLOCK_SEARCH_SYNONYMS).flat() as string[])) {
    if (word.length > 2 && word.endsWith('も') && searchReading(text).startsWith(searchReading(word))) {
      add(word, 0);
      add(text.slice(word.length), 0, true);
    }
  }
  const headerEvent = (!/^もし/.test(text) || /(?:おされた|おした)とき$/.test(text)) && /(?:とき(?:に)?|時|たびに|ごとに|たら)(?:、.*)?$/.test(text)
    ? /合図/.test(text) ? 'message'
      : /(?:はいけい|背景).*(?:かわ|変わ|かえ|切り)/.test(text) ? 'backdropChanged'
      : /コピー|クローン/.test(text) ? 'cloneStart'
      : /中身.*かわ|中身.*変わ|文字が入った/.test(text) ? 'valueChanged'
      : /キー|矢印/.test(text) || keys.length ? 'keyDown'
      : /タップ|クリック|タッチされ|おされた|おした/.test(text) ? 'click'
      : /ふれ|触れ|タッチした/.test(text) ? 'touchStart'
      : /スタート|始ま|はじま|開始|実行|はじめ|作品を動かした/.test(text) ? 'start' : null
    : null;
  return { text, subject, strings, stringValues, names: extractedNames, numbers, keys, clauses, seeds, headerEvent, subjects };
}

export function assistVerificationContext<T extends { key?: string; ownerKey?: string }>(ctx: T) {
  const { key, ownerKey, ...rest } = ctx;
  return rest;
}

export function assistCanonical(text: unknown, ctx: AssistContext, previous = ''): AssistCanonical | null {
  const clean = String(text).trim().replace(/。{2,}$/, '。');
  const variants = [
    clean,
    /、$/.test(clean) ? clean + '\n  何もしない。' : clean + '。',
    clean.replace(/、?$/, '、') + '\n  何もしない。',
    clean.replace(/。?$/, '。') + '\n  何もしない。',
    clean + '\n  何もしない。',
  ];
  for (const source of variants) {
    for (const prefix of ['', ...(previous ? [previous + '\n'] : [])]) {
      try {
        const parsed = parseSyntax(prefix + source, ctx);
        if (!parsed.ast) continue;
        let canonical = formatScript(parsed.ast, { symbols: ctx.symbols }).trim();
        if (prefix) {
          canonical = canonical.split('\n').slice(prefix.trim().split('\n').length).join('\n');
          if (parsed.ast.body?.length > 1) parsed.ast.body = parsed.ast.body.slice(1);
        }
        if (source !== clean && source.endsWith('\n  何もしない。')) canonical = canonical.split('\n').slice(0, -1).join('\n');
        return { text: canonical, ast: parsed.ast };
      } catch {}
    }
  }
  return null;
}

export function assistSourceRange(basis: string, diagnostic: { readonly line?: number }, ctx: AssistContext): AssistRange | null {
  // (raw is undefined past the last line; the pattern of the indent matches every line)
  const lines = basis.split('\n');
  const index = (diagnostic.line || 1) - 1;
  const raw = lines[index] as string | undefined;
  if (raw === undefined) return null;
  const lineStart = lines.slice(0, index).reduce((n, s) => n + s.length + 1, 0);
  const indent = raw.match(/^\s*/)![0].length;
  const pieces = assistSplit(raw.slice(indent), '。');
  let piece = pieces[0];
  if (pieces.length > 1) {
    piece = pieces.find(p => {
      try { return !parseSyntax(p.text + '。', ctx).ast; } catch { return true; }
    }) || { text: raw.slice(indent), start: 0, end: raw.length - indent };
  }
  if (/。\s*(?:#|＃|\/\/|／／|--|\/\*)/.test(raw)) piece = { text: raw.slice(indent), start: 0, end: raw.length - indent };
  if (!piece) return null;
  return { start: lineStart + indent + piece.start, end: lineStart + indent + piece.end, lineStart, lineEnd: lineStart + raw.length, indent, line: index + 1, text: piece.text };
}

export function assistClauseForms(text: string): string[] {
  const { masked, restore } = assistProtect(text);
  const out = new Set([text, ...searchQueryVariants(masked).map(form => restore(form))]);
  for (const [te, word] of SENTENCE_TE_FORMS) {
    if (text.endsWith(te)) out.add(text.slice(0, -te.length) + word);
  }
  return [...out];
}

// Every node of a syntax tree, in the order written (the sentences, the sentences in them and their values).
export function assistNodes(tree: unknown): AssistNode[] {
  const nodes: AssistNode[] = [];
  const visit = (n: unknown) => {
    if (Array.isArray(n)) { n.forEach(visit); return; }
    if (!n || typeof n !== 'object') return;
    if ((n as AssistNode).kind) nodes.push(n as AssistNode);
    for (const [k, v] of Object.entries(n)) if (k !== 'sourceSpan') visit(v);
  };
  visit(tree);
  return nodes;
}

export const assistKinds = (ast: Script) => new Set(assistNodes(ast.body).map(n => n.kind));
export const assistKindsOps = (ast: Script) => assistNodes(ast.body).map(n => n.kind + ':' + n.op);

// Helper for memoized template canonicalization inside assistFillHint.
export function assistCanonicalTemplate(text: string, ctx: AssistContext, cache?: Map<string, AssistCanonical | null>): AssistCanonical | null {
  if (!cache) return assistCanonical(text, ctx);
  const key = [text, ctx.definitionKind || '', ctx.targetId || '', ctx.meijin ? '1' : '0', (ctx.args || []).join(',')].join('\0');
  if (!cache.has(key)) {
    const parsed = assistCanonical(text, ctx);
    cache.set(key, parsed);
  }
  const hit = cache.get(key);
  return hit ? { text: hit.text, ast: structuredClone(hit.ast) } : null;
}
