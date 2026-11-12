import { buildSymbols } from './03-default-assets.ts';
import { parseExpression } from './04-syntax-expressions.ts';
import { SENTENCE_TE_FORMS } from './04-syntax-sentences.ts';
import { parseScript } from './04-syntax-scripts.ts';
import { BLOCK_SCHEMA_BY_ID, blockDecode, blockEncode, createBlock } from './05-command-presentation.ts';
import { formatExpression, formatScript } from './06-source-formatting.ts';
import { normalizeSearchText, searchReading } from './09-editor-sessions.ts';
import type { BlockTree } from '../types/blocks.d.ts';
import type { Hint, SearchIntent } from '../types/editor.d.ts';
import type { ParseContext } from '../types/parse.d.ts';
import type { Project } from '../types/project.d.ts';
import type { Expression, Statement } from '../types/syntax.d.ts';

// ────────────────────────────────────────────────────────────────────────
// 09-editor-search-core.ts — the first half of 09-editor-search.ts in dependency order, split off by the rule of size
// (AUDIT.md「ソースの境界」). It uses nothing in 09-editor-search.ts.
// ────────────────────────────────────────────────────────────────────────
export function hintSchemaId(id: string) {
  const prefix = id.split(':')[0];
  return ({read:'VariableRead',set:'Assignment',assignList:'Assignment',add:'NumericUpdate:ADD',
    subtract:'NumericUpdate:SUB',append:'ListAppend',insert:'ListInsert',replace:'ListReplace',
    delete:'ListDelete',clear:'ListClear',each:'ForEach',action:'UserActionCall',function:'UserFunctionCall',return:'ReturnStatement',localScalar:'LocalVariableDeclaration',localList:'LocalListDeclaration'} as Partial<Record<string, string>>)[prefix] || id;
}
export function matchesSearch(text: unknown, query: unknown) {
  return searchQueryVariants(query).some(q => normalizeSearchText(text).includes(normalizeSearchText(q)) || searchReading(text).includes(searchReading(q)));
}
// The other forms of a verb find its block too (E-13): ふれた・ふれて・ふれたら・ふれない・ふれます → ふれる,
// まわった → まわる, and ふれる also finds the forms that keep its stem (ふれている). A stem keeps at least two kana, so
// short words such as した (下) stay as they are.
const SEARCH_A_TO_U = Object.freeze({ わ:'う', か:'く', が:'ぐ', さ:'す', た:'つ', な:'ぬ', ば:'ぶ', ま:'む', ら:'る' });
const SEARCH_I_TO_U = Object.freeze({ い:'う', き:'く', ぎ:'ぐ', し:'す', ち:'つ', に:'ぬ', び:'ぶ', み:'む', り:'る' });
function searchVerbForms(word: string) {
  const out: string[] = [], add = (stem: string, ...endings: string[]) => { if ([...stem].length >= 2) for (const ending of endings) out.push(stem + ending); };
  const s = word.replace(/([ただ])ら$/, '$1');
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(.+)っ[たて]$/))) add(m[1], 'る', 'う', 'つ');
  else if ((m = s.match(/^(.+)ん[だで]$/))) add(m[1], 'む', 'ぶ', 'ぬ');
  else if ((m = s.match(/^(.+)い[たて]$/))) add(m[1], 'く'), add(m[1] + 'い', 'る');
  else if ((m = s.match(/^(.+)い[だで]$/))) add(m[1], 'ぐ');
  else if ((m = s.match(/^(.+)し[たて]$/))) add(m[1], 'す'), add(m[1] + 'し', 'る');
  else if ((m = s.match(/^(.+)[たて]$/))) add(m[1], 'る');
  // A noun made from a verb (くりかえし, うごき) finds the verb (くりかえす, うごく).
  // (a last kana not in the table finds nothing there: undefined)
  if ([...word].length >= 3 && SEARCH_I_TO_U[word.slice(-1) as keyof typeof SEARCH_I_TO_U] as string | undefined) add(word.slice(0, -1), SEARCH_I_TO_U[word.slice(-1) as keyof typeof SEARCH_I_TO_U]);
  if ((m = word.match(/^(.+)ない$/))) {
    const last = m[1].slice(-1);
    // (a kana not in the table: undefined)
    if (SEARCH_A_TO_U[last as keyof typeof SEARCH_A_TO_U] as string | undefined) add(m[1].slice(0, -1), SEARCH_A_TO_U[last as keyof typeof SEARCH_A_TO_U]);
    add(m[1], 'る');
  }
  if ((m = word.match(/^(.+)ま(?:す|した|せん)$/))) {
    const last = m[1].slice(-1);
    // (a kana not in the table: undefined)
    if (SEARCH_I_TO_U[last as keyof typeof SEARCH_I_TO_U] as string | undefined) add(m[1].slice(0, -1), SEARCH_I_TO_U[last as keyof typeof SEARCH_I_TO_U]);
    add(m[1], 'る');
  }
  // A verb like ふれる・かくれる・とめる (its stem ends in an -i or -e sound) also finds the forms that keep the stem:
  // ふれる finds ふれている. A stem like うご (動く) would find every 動き block, so other verbs do not.
  for (const form of [word, ...out]) if (/[いきしちにひみりぎじびぴえけせてねへめれげぜでべぺ]る$/.test(form)) add(form.slice(0, -1), '');
  return [...new Set(out)];
}
// A child searches with what they want: 少し待つ, みんなで待つ, ねこだけ待つ, 待ちたい, 止めたい, ぜんぶけす, スペース, ゆっくり.
const SEARCH_QUERY_VARIANT_CACHE=new Map<string, string[]>();
export function searchQueryVariants(query: unknown, {condition=false}: { condition?: boolean } = {}) {
  const q = normalizeSearchText(query), out = new Set([q]);
  const cacheKey=(condition?'condition:':'action:')+q;if(SEARCH_QUERY_VARIANT_CACHE.has(cacheKey))return SEARCH_QUERY_VARIANT_CACHE.get(cacheKey)!;
  const t = q.replace(/^(?:もう)?(?:もっと|少し|すこし|ちょっと|しばらく|みんなで|みんなは|みんなが|全体で)/, '').replace(/^.+?だけ(?=.)/, '').replace(/^(?:ゲーム|げーむ)(?=しゅうりょう)/,'');
  out.add(t);
  const wishes = {ちたい:['つ'],きたい:['く'],したい:['す'],みたい:['む','る'],りたい:['る'],いたい:['う'],びたい:['ぶ'],ぎたい:['ぐ'],
    めたい:['める'],えたい:['える'],せたい:['せる'],れたい:['れる'],げたい:['げる'],べたい:['べる'],けたい:['ける']};
  for (const [wish, endings] of Object.entries(wishes)) if (t.endsWith(wish)) for (const ending of endings) out.add(t.slice(0, -wish.length) + ending);
  // Search-only endings. None of these are added to the sentence reader's forms.
  // (each pattern takes only the kana of the table it looks up)
  const endings: readonly (readonly [RegExp, (m: RegExpExecArray) => string[], boolean?])[]=[
    [/(.+)(?:たいです|たいな)$/,m=>[m[1]+'たい']],
    [/(.+?)(?:しなさい|しろ|せよ|しましょう|しよう|したい)$/,m=>[m[1]+'する']],
    [/(.+?)([いきぎしちにびみり])(?:ます|ました|なさい|ましょう|な)$/,m=>[m[1]+SEARCH_I_TO_U[m[2] as keyof typeof SEARCH_I_TO_U],m[1]+m[2]+'る']],
    [/(.+?[えけげせぜてでねへべめれ])(?:ます|ました|なさい|よう|たい|た)$/,m=>[m[1]+'る']],
    [/(.+?)(?:行っ[たて])$/,m=>[m[1]+'行く']], [/(.+?)いっ[たて]$/,m=>[m[1]+'いく']],
    [/(.+?)([わかがさたなばまら])せ(?:る|た|て)$/,m=>[m[1]+SEARCH_A_TO_U[m[2] as keyof typeof SEARCH_A_TO_U]]],
    [/(.+?[えけげせぜてでねへべめれ])させる$/,m=>[m[1]+'る']], [/(.+?)させる$/,m=>[m[1]+'する']],
    [/(.+?)(て|で)(?:くださいね|ください|ほしい|くれ|おいて|おく|ね|よ|いる|てね|て|る)$/,m=>[m[1]+m[2]]],
    [/(.+?)(?:ちゃった|ちゃう|ちゃえ)$/,m=>[m[1]+'て']], [/(.+?)(?:じゃった|じゃう|じゃえ)$/,m=>[m[1]+'で']],
    [/(.+?)(?:といて|とく)$/,m=>[m[1]+'て']], [/(.+?)(?:どいて|どく)$/,m=>[m[1]+'で']],
    [/(.+?)まして$/,m=>[m[1]+'ます']], [/(.+?)まーす$/,m=>[m[1]+'ます']],
    [/(.+?)(?:こと|の|ぞ|よ|ね|ー)$/,m=>[m[1]]], [/(.+?[うくぐすつぬぶむる])(?:んだ|んです)$/,m=>[m[1]]],
    [/(.+?)った$/,m=>['る','う','つ'].map(x=>m[1]+x)], [/(.+?)んだ$/,m=>['む','ぶ','ぬ'].map(x=>m[1]+x)],
    [/(.+?)いた$/,m=>[m[1]+'く']], [/(.+?)いだ$/,m=>[m[1]+'ぐ']], [/(.+?)した$/,m=>[m[1]+'す',m[1]+'する']],
    [/(.+?)([えけげせぜてでねへべめれ])$/,m=>[m[1]+'うくぐすずつづぬふぶむる'['えけげせぜてでねへべめれ'.indexOf(m[2])]]],
    [/(.+?)ろ$/,m=>[m[1]+'る']], [/(.+?)([おこごそとどのほぼもろ])う$/,m=>[m[1]+'うくぐすつづぬふぶむる'['おこごそとどのほぼもろ'.indexOf(m[2])]]],
    [/(.+?)に(?:決める|きめる|設定する|せっていする|セットする|せっとする|変更する|へんこうする)$/,m=>[m[1]+'にする']],
    [/(.+?)のとこ(?:へ|に|まで)$/,m=>[m[1]+'のところへ']],
    [/(.+?)(?:の場合(?:は|には)?|のばあい(?:は|には)?|だと|だったなら|だったとしたら|だとしたら)、?$/,m=>[m[1]+'なら、'],true],
    [/(.+?)(?:じゃなければ|じゃなかったら|じゃないなら)$/,m=>[m[1]+'でなければ'],true],
    [/(.+?)(?:うちは|かぎり|の間は|間は)$/,m=>[m[1]+'あいだ'],true],
    [/(.+?)てなければ$/,m=>[m[1]+'ていなければ'],true], [/(.+?)てるなら$/,m=>[m[1]+'ているなら'],true],
    [/(.+?)くなったら$/,m=>[m[1]+'かったら'],true], [/(.+?)のとき(?:は)?$/,m=>[m[1]+'なら'],true],
    [/(.+?)(?:でかつ|でさらに|かつ|そして)$/,m=>[m[1]+'で'],true], [/(.+?)(?:または|もしくは)$/,m=>[m[1]+'か'],true],
    [/(.+?)てるあいだ$/,m=>[m[1]+'ているあいだ'],true], [/(.+?)てないあいだ$/,m=>[m[1]+'ていないあいだ'],true],
    [/(.+?)ふれなければ$/,m=>[m[1]+'ふれていなければ'],true], [/(.+?)ふれないあいだ$/,m=>[m[1]+'ふれていないあいだ'],true],
    [/(.+?)いとき(?:は)?$/,m=>[m[1]+'いなら'],true], [/(.+?)じゃないとき$/,m=>[m[1]+'でなければ'],true],
    [/(.+?)がいれば$/,m=>[m[1]+'があれば'],true],
    [/(.+?)おおきければ$/,m=>[m[1]+'大きければ'],true], [/(.+?)ちいさければ$/,m=>[m[1]+'小さければ'],true],
    [/(.+?)るのを(?:待つ|まつ|待ちます)$/,m=>[m[1]+'るまで待つ']],
    [/(.+?)るのを待って$/,m=>[m[1]+'るまで待って']],
  ];
  for(let pass=0;pass<2;pass++)for(const form of [...out]){
    for(const [pattern,replace,onlyCondition] of endings){if(onlyCondition&&!condition)continue;const m=pattern.exec(form);if(m)for(const v of replace(m))if(v)out.add(v);}
    for(const [te,word]of SENTENCE_TE_FORMS)if(form.endsWith(te))out.add(form.slice(0,-te.length)+word);
    if(form.endsWith('して'))out.add(form.slice(0,-2)+'す'),out.add(form.slice(0,-2)+'する');
  }
  for (const form of searchVerbForms(t)) out.add(form);
  let written = t;
  for (const [word, key] of [['すぺーすきー','空白'],['すぺーす','空白'],['えんたー','決定'],['りたーん','決定'],['えすけーぷ','取消'],['ぜんぶ','全部'],['すべて','全部'],['けす','消す']])
    written = written.split(word).join(key);
  out.add(written);
  if (t.includes('ゆっくり')) out.add('かけて');
  const variants=[...out].filter(Boolean);if(SEARCH_QUERY_VARIANT_CACHE.size>=2000)SEARCH_QUERY_VARIANT_CACHE.clear();SEARCH_QUERY_VARIANT_CACHE.set(cacheKey,variants);return variants;
}
export function configureSearchNode(node: BlockTree, intent: SearchIntent | null) {
  if (!intent || node.schemaId !== intent.schemaId) return node;
  // いまのばしょから動く starts as 右へ10歩: the leg moves to the axis of the direction asked for.
  if (intent.direction && node.schemaId === 'MotionCommand:MOVE_BY') {
    const vertical = ['up', 'down'].includes(intent.direction);
    if (vertical && node.inputs.x) { node.inputs.y = node.inputs.x; delete node.inputs.x; }
    // (the direction asked for is of the axis the leg moves on)
    (node.fields as { [key: string]: unknown })[vertical ? 'yDir' : 'xDir'] = intent.direction;
  // (a direction is written only into a block that has that field: 左を向く sets the 向き by its value, -90)
  } else if (intent.direction && BLOCK_SCHEMA_BY_ID.get(node.schemaId)?.fields.some(f => f.key === 'direction')) node.fields.direction = intent.direction;
  if (intent.scale !== undefined) {
    const oldId = (node.inputs.args as BlockTree[])[0].id;
    (node.inputs.args as BlockTree[])[0] = createBlock('NumberLiteral');
    (node.inputs.args as BlockTree[])[0].id = oldId; (node.inputs.args as BlockTree[])[0].fields.value = intent.scale;
  }
  if (intent.index !== undefined) {
    const oldId = (node.inputs.index as BlockTree).id;
    node.inputs.index = createBlock('NumberLiteral'); node.inputs.index.id = oldId;
    // (an index asked for is a number)
    node.inputs.index.fields.value = intent.index!;
  }
  // The number, the colour and the empty text the words ask for, as the near form puts them (assistFillHint): the
  // number into the first number of the block, the colour into its first value, the empty text into its second.
  const args = Array.isArray(node.inputs.args) ? node.inputs.args as BlockTree[] : [];
  const literal = (at: number, schemaId: string, value: string | number) => {
    if (!args[at]) return;
    const made = createBlock(schemaId); made.id = args[at].id; made.fields.value = value; args[at] = made;
  };
  if (typeof intent.value === 'number' && intent.scale === undefined) {
    const at = args.findIndex(a => a.schemaId === 'NumberLiteral');
    // (a number below 0 is the minus block over its size, as the block view makes it: 左を向く is 向きを－90度にする)
    if (at >= 0 && intent.value < 0) { const neg = createBlock('UnaryExpression:NEG'); neg.id = args[at].id; neg.inputs.value!.id = args[at].id + '-size'; neg.inputs.value!.fields.value = -intent.value; args[at] = neg; }
    else if (at >= 0) args[at].fields.value = intent.value;
  }
  if (intent.color) literal(0, 'StringLiteral', intent.color);
  if (intent.empty) literal(1, 'StringLiteral', '');
  return node;
}
export function nodeForSearchHint(hint: Pick<Hint, 'mode' | 'text'>, project: Project, context: ParseContext = {}, intent: SearchIntent | null = null) {
  const symbols = buildSymbols(project), ast = hint.mode === 'expression'
    ? parseExpression(hint.text, symbols, context)
    : parseScript(hint.text, symbols, context).body[0];
  return configureSearchNode(blockEncode(ast).tree, intent);
}
// The keys a child names in a search, by the names the code writes (「スペース」キー, 「エンター」キー).
const SEARCH_KEYS = Object.freeze({ すぺーす: '空白', えんたー: '決定', りたーん: '決定', えすけーぷ: '取消' });
export function searchKey(query: unknown) {
  const q = normalizeSearchText(query).replace(/[「」]/g, '').replace(/きー$/, '');
  return Object.hasOwn(SEARCH_KEYS, q) ? SEARCH_KEYS[q as keyof typeof SEARCH_KEYS] : null;
}
// 〜キーがおされるまで待つ／くり返す (what it repeats stays to be chosen) and 〜キーがおされている, with the key.
export function keyedSearchCandidate(schemaId: string, key: string, project?: Project | null) {
  const schema = BLOCK_SCHEMA_BY_ID.get(schemaId);
  if (!schema) return null;
  const sensorOnly = schemaId === 'SensorRead:KEY_DOWN', node = createBlock(schemaId, { draft: !sensorOnly, allowHoles: true, idPrefix: 'search-key' }),
    sensor = sensorOnly ? node : createBlock('SensorRead:KEY_DOWN', { idPrefix: 'search-key-sensor' });
  (sensor.inputs.arg as BlockTree).fields.value = key;
  if (!sensorOnly) { sensor.id = (node.inputs.condition as BlockTree).id; node.inputs.condition = sensor; }
  let text = '';
  try {
    // The first line is the block's words; what it repeats is still to be chosen, so the copy written here has 何もしない.
    const written = structuredClone(node);
    for (const key of Object.keys(written.bodies || {})) written.bodies[key] = [createBlock('NoOperation', { idPrefix: 'search-key-text' })];
    const decoded = blockDecode(written), symbols = project ? buildSymbols(project) : undefined;
    // (the key's sensor is a value; the other blocks are sentences)
    text = (sensorOnly ? formatExpression(decoded as Expression) : formatScript({ kind: 'Script', body: [decoded as Statement] }, { symbols })).split(/\n/)[0];
  } catch (_) { /* The face says what it is. */ }
  return { ...schema, candidateNode: node, candidateKey: 'key:' + key + ':' + schemaId, ...(text ? { searchLabel: text, searchCaption: true } : {}) };
}
// Holding a key to move (C-16 with B-09): the continuous rule is taught first, so for the words of holding and of
// moving on at a speed its sentence and its block come before the repeat while a key is held.
const HOLD_SEARCH_WORDS = ['おしているあいだ', 'おしている間', 'おされているあいだ', 'おされている間', 'おしっぱなし', 'おしつづける',
  '動き続ける', 'うごきつづける', 'つづけて動く', '速さ'];
export function holdFirst(id: string, query: unknown) {
  if (hintSchemaId(id) !== 'ContinuousRule') return 0;
  const q = normalizeSearchText(query);
  return Number(HOLD_SEARCH_WORDS.some(word => { const w = normalizeSearchText(word); return q.includes(w) || (q.length >= 4 && w.includes(q)); }));
}

// The words a child uses for what a block does find it too (E-13): くらべる, ランダム, まわす, やめる, へる, クリック …
export const BLOCK_SEARCH_SYNONYMS: { readonly [schemaId: string]: readonly string[] | undefined } = Object.freeze({
  "MotionCommand:MOVE_BY": [
    "動く",
    "うごく",
    "移動",
    "ばしょ",
    "いまのばしょ",
    "右へ",
    "左へ",
    "上へ",
    "下へ",
    "みぎ",
    "ひだり",
    "うえ",
    "した",
    "歩く",
    "ずらす",
    "なめらかに動く",
    "時間をかける",
    "おちる",
    "落ちる",
    "さがる",
    "のぼる",
    "ゆっくり",
    "ジャンプ",
    "とぶ",
    "とびはねる",
    "ずれる"
  ],
  "ListInsert": [
    "挿入",
    "そうにゅう",
    "途中に入れる",
    "番号の前に入れる",
    "わりこませる",
    "わりこむ",
    "割り込む",
    "つっこむ",
    "突っ込む",
    "おく",
    "置く"
  ],
  "MotionCommand:MOVE": [
    "進む",
    "すすむ",
    "前へ",
    "後ろへ",
    "まっすぐ",
    "歩く",
    "あるく",
    "動く",
    "うごく",
    "移動",
    "走る",
    "はしる",
    "前進",
    "ぜんしん",
    "ダッシュ",
    "すすめる",
    "進める"
  ],
  "MotionCommand:GOTO": [
    "行く",
    "いく",
    "ばしょ",
    "場所へ行く",
    "決めたばしょ",
    "座標",
    "移動",
    "左下のはし",
    "もどる",
    "戻る"
  ],
  "MotionCommand:GOTO_PART": [
    "ところへ行く",
    "行く",
    "いく",
    "マウス",
    "追いかける",
    "ついていく",
    "近づく",
    "ばしょ",
    "移動",
    "ワープ",
    "近よる",
    "近寄る",
    "ちかよる",
    "くっつく",
    "めざす",
    "目指す",
    "おいつく",
    "追いつく"
  ],
  "MotionCommand:TURN_RIGHT": [
    "右回り",
    "右へ回る",
    "回る",
    "まわる",
    "回す",
    "まわす",
    "向きを変える",
    "回転",
    "曲がる",
    "まがる",
    "ターン",
    "ひねる"
  ],
  "MotionCommand:TURN_LEFT": [
    "左回り",
    "左へ回る",
    "回る",
    "まわる",
    "回す",
    "まわす",
    "向きを変える",
    "回転",
    "曲がる",
    "まがる",
    "ターン",
    "ひねる"
  ],
  "MotionCommand:BOUNCE": [
    "はね返る",
    "はねかえる",
    "はねる",
    "かべ",
    "ぶつかる",
    "反対に動く",
    "はね返す",
    "はねかえす",
    "はずむ",
    "バウンド"
  ],
  "CompareExpression": [
    "くらべる",
    "比べる"
  ],
  "CompareExpression:GTE": [
    "くらべる",
    "比べる",
    "いじょう",
    "と同じか より大きい",
    "と同じかより大きい"
  ],
  "CompareExpression:LTE": [
    "くらべる",
    "比べる",
    "いか",
    "と同じか より小さい",
    "と同じかより小さい"
  ],
  "BuiltinCall:乱数": [
    "ランダム",
    "でたらめ",
    "さいころ"
  ],
  "LooksCommand:SHOW": [
    "見せる",
    "表示",
    "出す",
    "でてくる",
    "出てくる",
    "あらわれる",
    "みえる",
    "登場",
    "出現",
    "あらわす",
    "現す"
  ],
  "LooksCommand:HIDE": [
    "隠す",
    "かくす",
    "非表示",
    "きえる",
    "消える",
    "かくれる",
    "みえなくする",
    "消す",
    "けす",
    "見えないように",
    "表示しない",
    "退場",
    "透明",
    "みえなくなる"
  ],
  "LooksCommand:SET_COSTUME": [
    "きがえる",
    "みため",
    "見た目",
    "変身",
    "へんしん",
    "コスチューム",
    "ポーズ",
    "衣装"
  ],
  "LooksCommand:SET_TARGET_TEXT": [
    "出す",
    "書く",
    "表示",
    "文字",
    "点数",
    "テキスト",
    "ラベル"
  ],
  "StopCommand:ALL": [
    "とめる",
    "止める",
    "とまる",
    "止まる",
    "やめる",
    "ストップ",
    "おわる",
    "おわり",
    "おしまい",
    "ゲームオーバー",
    "終了",
    "終わらせる",
    "おわらせる",
    "ゲームストップ",
    "みんな",
    "全員",
    "ぜんぶやめる",
    "しゅうりょう"
  ],
  "StopCommand:THIS": [
    "とめる",
    "止める",
    "とまる",
    "止まる",
    "やめる",
    "ストップ",
    "スクリプト",
    "プログラム",
    "本文"
  ],
  "StopCommand:OTHERS": [
    "とめる",
    "止める",
    "とまる",
    "止まる",
    "やめる",
    "ストップ",
    "ほかの部品",
    "ほかの部品の動き",
    "自分以外",
    "じぶんいがい"
  ],
  "Break": [
    "やめる",
    "ぬける",
    "おわる",
    "くり返しをやめる",
    "くり返しを止める",
    "くり返しを終わる",
    "くり返しから出る",
    "ループから出る",
    "ループを止める",
    "ループをやめる",
    "ループを終える",
    "ぬけ出す",
    "抜ける",
    "ブレイク"
  ],
  "PenCommand:DOWN": [
    "せん",
    "線",
    "かく",
    "えがく",
    "ペンを下げる",
    "ペンをさげる",
    "ペンをつける",
    "ペンをおく",
    "ペンを置く",
    "ペンを下におく",
    "ペンを紙につける",
    "線を描く",
    "線をひく",
    "線を引く",
    "線をかく",
    "線を書く",
    "かきはじめる",
    "書き始める",
    "書きはじめる",
    "絵をかく",
    "お絵かき",
    "ペンダウン",
    "ペンおろす",
    "ペン下ろす",
    "ペンON",
    "ペンオン",
    "描き始める",
    "描きはじめる",
    "ペンをおとす",
    "ペンを落とす",
    "引き始める",
    "ひきはじめる"
  ],
  "PenCommand:SET_SIZE": [
    "太く",
    "ふとく",
    "細く",
    "ほそく",
    "太い",
    "ふとい",
    "細い",
    "ほそい",
    "ペンを太く",
    "ペンを細く",
    "線を太く",
    "線を細く",
    "線の太さ",
    "ペンのサイズ",
    "ペンの大きさ",
    "太い線",
    "細い線",
    "ふとい線"
  ],
  "LooksCommand:SET_SCALE": [
    "大きさ",
    "おおきさ",
    "サイズ"
  ],
  "Say": [
    "話す",
    "言う",
    "いう",
    "はなす",
    "しゃべる",
    "発言",
    "こんにちは",
    "秒",
    "ひょうじ",
    "発表",
    "はっぴょう",
    "せりふ",
    "ふきだし",
    "こえ",
    "考える",
    "かんがえる",
    "思う",
    "おもう",
    "さけぶ",
    "叫ぶ",
    "つぶやく",
    "語る",
    "あいさつ",
    "話しかける",
    "おしゃべり",
    "返事",
    "声を出す",
    "声に出す",
    "メッセージを出す",
    "つたえる",
    "伝える",
    "見せる",
    "文字を出す",
    "どなる",
    "怒鳴る",
    "答える",
    "こたえる",
    "歌う",
    "うたう",
    "つげる",
    "告げる",
    "口に出す",
    "口にだす"
  ],
  "Ask": [
    "質問",
    "たずねる",
    "答え",
    "きく",
    "聞く",
    "しつもん",
    "もんだい",
    "問題",
    "クイズ",
    "問いかける"
  ],
  "WaitTime": [
    "待つ",
    "まつ",
    "時間",
    "秒"
  ],
  "WaitUntil": [
    "スペース",
    "スペースキー",
    "エンター",
    "エンターキー",
    "キー",
    "おすまで待つ",
    "おすまでまつ",
    "キーを待つ",
    "キーをまつ"
  ],
  "RepeatUntil": [
    "スペース",
    "スペースキー",
    "エンター",
    "エンターキー",
    "キー"
  ],
  "IfStatement": [
    "もし",
    "条件",
    "なら",
    "分かれ道"
  ],
  "RepeatCount": [
    "くり返す",
    "繰り返す",
    "何度も",
    "回数",
    "ループ",
    "リピート",
    "何回も"
  ],
  "UserActionCall": [
    "動作",
    "手順",
    "呼び出す",
    "実行"
  ],
  "UserFunctionCall": [
    "計算",
    "答え",
    "関数",
    "値を求める"
  ],
  "Assignment": [
    "変数",
    "記録",
    "代入",
    "値を入れる",
    "もどす",
    "戻す",
    "セット",
    "設定",
    "変更",
    "決める",
    "きめる",
    "リセット",
    "初期化",
    "クリア",
    "保存"
  ],
  "NumericUpdate:ADD": [
    "増やす",
    "ふやす",
    "増える",
    "ふえる",
    "足す",
    "たす",
    "プラス",
    "数える",
    "かぞえる",
    "点数",
    "スコア",
    "あげる",
    "上げる",
    "アップ",
    "加える",
    "くわえる",
    "加算",
    "増し",
    "多くする",
    "おおくする",
    "カウント",
    "追加",
    "増加",
    "ぞうか",
    "増す"
  ],
  "NumericUpdate:SUB": [
    "減らす",
    "へらす",
    "減る",
    "へる",
    "引く",
    "ひく",
    "マイナス",
    "点数",
    "スコア",
    "少なくする",
    "すくなくする",
    "さげる",
    "下げる",
    "ダウン",
    "減少",
    "げんしょう",
    "けずる",
    "削る"
  ],
  "VariableRead": [
    "変数",
    "値",
    "読む",
    "スコア"
  ],
  "Broadcast": [
    "合図",
    "メッセージ",
    "知らせる",
    "しらせる",
    "つたえる",
    "サイン"
  ],
  "BroadcastAndWait": [
    "合図",
    "メッセージ",
    "知らせる",
    "しらせる",
    "つたえる"
  ],
  "SoundCommand:TONE_WAIT": [
    "ドレミ",
    "ド",
    "レ",
    "ミ",
    "ファ",
    "ソ",
    "ラ",
    "シ",
    "メロディー",
    "ピアノ",
    "音の高さ",
    "鳴る",
    "音楽",
    "ヘルツ",
    "流す",
    "再生",
    "音を出す",
    "ピー",
    "ピッ",
    "ビープ"
  ],
  "SoundCommand:TONE": [
    "ドレミ",
    "ド",
    "レ",
    "ミ",
    "ファ",
    "ソ",
    "ラ",
    "シ",
    "メロディー",
    "ピアノ",
    "音の高さ",
    "鳴る",
    "音楽"
  ],
  "SoundCommand:SAMPLE_WAIT": [
    "鳴る",
    "音楽",
    "流す",
    "ながす",
    "再生",
    "プレイ",
    "音を出す",
    "音がする",
    "聞かせる",
    "きかせる"
  ],
  "SoundCommand:SAMPLE": [
    "鳴る",
    "音楽",
    "スタート",
    "鳴り始める",
    "流し始める"
  ],
  "SensorRead:マウスが押されている": [
    "クリック",
    "タッチ",
    "おす",
    "押す"
  ],
  "EventCount:click": [
    "クリック",
    "タッチ",
    "おす",
    "押す"
  ],
  "SensorRead:KEY_DOWN": [
    "おす",
    "押す",
    "キー",
    "スペース",
    "スペースキー",
    "エンター",
    "エンターキー",
    "やじるし"
  ],
  "SensorRead:押されたキー": [
    "キー"
  ],
  "ContinuousRule": [
    "おしているあいだ",
    "おしている間",
    "おしっぱなし",
    "おしつづける",
    "キーをおしているあいだ",
    "つづけて動く",
    "動き続ける",
    "はやく",
    "はやい",
    "進み続ける",
    "すすみつづける"
  ],
  "RepeatWhile": [
    "おしているあいだ",
    "おしっぱなし",
    "あいだ",
    "間"
  ],
  "SensorRead:TOUCHING": [
    "ふれる",
    "ふれたら",
    "ふれたとき",
    "さわる",
    "さわったら",
    "あたる",
    "当たる",
    "ぶつかる",
    "かさなる",
    "はし",
    "タッチ",
    "かべ"
  ],
  "StopCommand:OWN_OTHERS": [
    "止める",
    "とめる",
    "とまる",
    "止まる",
    "やめる",
    "自分だけ",
    "ほかの動き",
    "ストップ"
  ],
  "MotionCommand:POINT_TO": [
    "向きをかえる",
    "向きを変える",
    "向かう",
    "見る",
    "見つめる",
    "みつめる"
  ],
  "LooksCommand:SET_COLOR": [
    "色をかえる",
    "色を変える",
    "そめる",
    "染める",
    "ぬる",
    "塗る",
    "色の効果",
    "ぬりかえる",
    "塗り替える"
  ],
  "LooksCommand:FRONT": [
    "最前面",
    "前面",
    "前に出る",
    "前に出す",
    "前に来る",
    "前にくる",
    "最前列",
    "さいぜんれつ"
  ],
  "LooksCommand:BACK": [
    "最背面",
    "背面"
  ],
  "LooksCommand:SET_BACKDROP": [
    "うしろの絵",
    "背景を変更"
  ],
  "LooksCommand:PREV_BACKDROP": [
    "もどす",
    "戻す"
  ],
  "LooksCommand:NEXT_COSTUME": [
    "コスチューム",
    "次の見た目",
    "次の絵",
    "ポーズ",
    "衣装"
  ],
  "LooksCommand:PREV_COSTUME": [
    "コスチューム",
    "前の見た目",
    "前の絵",
    "もどす",
    "戻す",
    "ポーズ",
    "衣装"
  ],
  "LooksCommand:SET_INPUT": [
    "入力する",
    "セット"
  ],
  "SoundCommand:PITCH_UP": [
    "半音上げる",
    "ピッチを上げる"
  ],
  "SoundCommand:PITCH_DOWN": [
    "半音下げる",
    "ピッチを下げる"
  ],
  "SoundCommand:STOP_ALL": [
    "音を消す",
    "すべての音を消す",
    "全部の音を消す",
    "音を全部消す",
    "音をストップ",
    "音楽をストップ"
  ],
  "PenCommand:UP": [
    "ペンを離す",
    "ペンをはなす",
    "ペンを紙から離す",
    "ペンを紙からはなす",
    "持ち上げる",
    "もち上げる",
    "うかせる",
    "浮かせる",
    "ペンをはずす",
    "ペンをしまう",
    "ペンをもどす",
    "かくのをやめる",
    "書くのをやめる",
    "かき終わる",
    "書き終わる",
    "線を止める",
    "線をとめる",
    "ペンを止める",
    "ペンをとめる",
    "ペンアップ",
    "ペンあげる",
    "ペン上げる",
    "引くのをやめる",
    "ひくのをやめる",
    "ペンを片づける",
    "ペンを片付ける",
    "ペンをかたづける"
  ],
  "PenCommand:SET_COLOR": [
    "線の色",
    "ペンのカラー"
  ],
  "PenCommand:STAMP": [
    "はんこ",
    "判子",
    "すがたをのこす",
    "スタンプおす",
    "スタンプ押す"
  ],
  "PenCommand:CLEAR": [
    "かいた線を消す",
    "描いた線を消す",
    "すべての線を消す",
    "線を全部消す",
    "作品の線とスタンプを消す",
    "作品の線とスタンプをみんな消す",
    "画面の線とスタンプを全部消す",
    "画面を消す",
    "ステージを消す",
    "画面をクリア",
    "消しゴム",
    "かいたものを消す",
    "描いたものを消す",
    "作品の絵を消す",
    "お絵かきを消す",
    "らくがきを消す",
    "えをけす"
  ],
  "Forever": [
    "ループ",
    "リピート",
    "永遠",
    "えいえん",
    "無限",
    "むげん",
    "永久",
    "いつまでも",
    "つねに",
    "ずーっと",
    "ずうっと",
    "えんえん",
    "つづける",
    "続ける",
    "何回も",
    "なんかいも",
    "何度も",
    "なんども"
  ],
  "NoOperation": [
    "何も起きない",
    "何もない",
    "そのまま",
    "ほうっておく",
    "からっぽ"
  ],
  "Continue": [
    "とばす",
    "スキップ",
    "コンティニュー",
    "次へ進む",
    "次のループ",
    "次にいく",
    "つぎにいく",
    "次に行く"
  ],
  "ListAppend": [
    "追加",
    "ついか",
    "プッシュ",
    "保存",
    "記録",
    "おぼえる",
    "覚える",
    "しまう",
    "メモ",
    "くわえる",
    "加える"
  ],
  "ListReplace": [
    "とりかえる",
    "取り替える",
    "取りかえる",
    "おきかえる",
    "置き換える",
    "置きかえる",
    "入れかえる",
    "入れ替える",
    "いれかえる",
    "書きかえる",
    "書き換える",
    "変更",
    "上書き",
    "セット",
    "交換",
    "こうかん",
    "チェンジ"
  ],
  "ListDelete": [
    "さくじょ",
    "取りのぞく",
    "取り除く",
    "とりのぞく",
    "捨てる",
    "すてる",
    "なくす",
    "消去"
  ],
  "ListClear": [
    "リセット",
    "クリア",
    "初期化",
    "からにする",
    "からっぽ",
    "空っぽ",
    "空にする",
    "すてる",
    "捨てる",
    "なくす"
  ],
  "TimerReset": [
    "タイマーを始める",
    "タイマーをはじめる",
    "タイマーをスタート",
    "クリア",
    "初期化",
    "リスタート",
    "はじめから数える"
  ],
  "Heading:start": [
    "スタート",
    "始まった",
    "はじまった",
    "始めた",
    "はじめた",
    "ゲーム",
    "プログラム",
    "実行",
    "動き出した",
    "開いた",
    "動かす",
    "ボタン"
  ],
  "Heading:click": [
    "タップ",
    "タッチ",
    "さわる",
    "さわった",
    "さわられた",
    "押す",
    "押した",
    "押された",
    "マウス",
    "ダブルクリック",
    "長おし",
    "長くおした"
  ],
  "Heading:keyDown": [
    "ごとに",
    "おされる",
    "押される",
    "タップ",
    "タッチ",
    "クリック",
    "打つ",
    "たたく",
    "どれか",
    "なにか"
  ],
  "Heading:message": [
    "どの合図でも",
    "どんな合図でも"
  ],
  "Heading:backdropChanged": [
    "切りかわる",
    "変化",
    "新しい",
    "かえた",
    "変えた",
    "ちがう",
    "後"
  ],
  "Heading:valueChanged": [
    "文字",
    "入力",
    "書いた",
    "書きこんだ",
    "内容",
    "変化",
    "かえた",
    "変えた"
  ],
  "Heading:cloneStart": [
    "クローン",
    "分身",
    "コピーされた",
    "生まれた",
    "出来た",
    "作成",
    "スタート",
    "始まった",
    "コピーを作った"
  ],
  "Heading:touchStart": [
    "タッチ",
    "接触",
    "重なった",
    "触った",
    "くっついた",
    "ふれあった",
    "来た"
  ],
  "CloneCommand:CREATE_SELF": [
    "クローン",
    "ぶんしん",
    "自分の分身を作る",
    "分身をつくる",
    "複製する",
    "作成する",
    "クローンする",
    "コピーする",
    "分身する",
    "自分をふやす",
    "自分を増やす",
    "もう1人作る",
    "もう一人作る",
    "コピー作る",
    "コピーつくる"
  ],
  "CloneCommand:CREATE_TARGET": [
    "クローン",
    "ぶんしん",
    "コピーする",
    "複製する",
    "クローンする",
    "コピー作る",
    "コピーつくる"
  ],
  "CloneCommand:DELETE_SELF": [
    "自分を消す",
    "自分をけす",
    "自分だけ",
    "自分自身",
    "自分をなくす",
    "このコピーをなくす",
    "コピーを消す",
    "コピーをけす",
    "自分のコピーを消す",
    "自分のコピーだけを消す",
    "このクローンを消す",
    "この分身を消す",
    "コピーを削除",
    "このクローンを削除",
    "コピーを消去",
    "消える",
    "きえる",
    "いなくなる",
    "このコピーを終わらせる",
    "このコピーをおわらせる",
    "このコピーをおしまいにする",
    "すぐ消す",
    "すぐけす",
    "コピー消す",
    "コピーけす"
  ],
  "ReturnStatement": [
    "リターンする"
  ],
  "LocalVariableDeclaration": [
    "という変数",
    "というへんすう"
  ],
  "LocalListDeclaration": [
    "リスト",
    "リストを作る"
  ]
});
// The search reads katakana as hiragana (normalizeSearchText): its words are written in hiragana here, and a color read
// in hiragana is named as the color presets name it (ぴんく is ピンク).
const colorName = (word: string): string => ({ ぴんく: 'ピンク', おれんじ: 'オレンジ' } as { readonly [word: string]: string | undefined })[word] || word;
export function searchIntent(value: unknown, context: { targetType?: string | null }={}): SearchIntent | null {
  // A diagonal (左上, みぎした, 右ななめ上, ななめ左下) or both ways of one axis (上下, 左右) names no one direction: its words give none.
  const q = normalizeSearchText(value), oneWays = q.replace(/(?:ななめ|斜め)?(?:(?:右|みぎ|左|ひだり)(?:ななめ|斜め)?(?:上|うえ|下|した)|(?:上|うえ|下|した)(?:ななめ|斜め)?(?:右|みぎ|左|ひだり))|(?:上|うえ)(?:下|した)|(?:下|した)(?:上|うえ)|(?:右|みぎ)(?:左|ひだり)|(?:左|ひだり)(?:右|みぎ)/g, '・'), direction = [
    ['right', /(?:右|みぎ)(?=へ|に|を|方向|向き|$)/] as const, ['left', /(?:左|ひだり)(?=へ|に|を|方向|向き|$)/] as const, ['up', /(?:上|うえ)(?=へ|に|を|方向|向き|$)/] as const, ['down', /(?:下|した)(?=へ|に|を|方向|向き|$)/] as const,
  ].filter(([, re]) => re.test(oneWays));
  const r=searchReading(value), number=/(\d+(?:\.\d+)?)/.exec(q), n=number?Number(number[1]):null;
  if(/(?:ほうこう|方向|方).*(?:むく|向く)/.test(q)&&!/画面/.test(q))return {schemaId:'MotionCommand:POINT_TO'};
  if(/(?:次|つぎ)の(?:すがた|姿|見た目|絵).*(?:なる|にする)/.test(q))return {schemaId:'LooksCommand:NEXT_COSTUME'};
  if(/(?:入力らん|入力欄).*空にする/.test(q))return {schemaId:'LooksCommand:SET_INPUT',empty:true};
  if(/(?:線|せん|すたんぷ).*(?:けす|消す|消し|削除|くりあ)/.test(q))return {schemaId:'PenCommand:CLEAR'};
  if(/という(?:変数|へんすう)を作る|(?:この中だけで使う)?変数【/.test(q))return {schemaId:'LocalVariableDeclaration'};
  if(/というりすとを作る|(?:この中だけで使う|空の)りすと【/.test(q))return {schemaId:'LocalListDeclaration'};
  if(/たいまー/.test(r)&&/もど|りせっと|くりあ|しょきか|はじめ|すたーと|ぜろ|0/.test(r))return {schemaId:'TimerReset'};
  // (two colours written together, 青緑 or 赤むらさき, name no one colour: none is given)
  const colors=new Set([...q.matchAll(/(黄色|茶色|水色|灰色|ぴんく|おれんじ|むらさき|赤|青|緑|白|黒)/g)].map(m=>m[1])),penColor=colors.size===1?/(黄色|茶色|水色|灰色|ぴんく|おれんじ|むらさき|赤|青|緑|白|黒)/.exec(q):null;
  if(/ぺん|せん/.test(r)&&/いろ|からー/.test(r))return {schemaId:'PenCommand:SET_COLOR',...(penColor?{color:colorName(penColor[1])}:{})};
  if(/ぺん|せん/.test(r)&&/ふとさ|さいず|おおきさ|ふとく|ほそく/.test(r))return {schemaId:'PenCommand:SET_SIZE'};
  if(/ぺん|せん/.test(r)&&/やめ|とめ|はな|しまう|かたづけ|うかせ/.test(r))return {schemaId:'PenCommand:UP'};
  if(/^(?:かき|ひき|書き|引き)はじめる$|(?:線|せん)を(?:かく|書く)$/.test(q)&&!penColor)return {schemaId:'PenCommand:DOWN'};
  if(/すたんぷ|はんこ/.test(r)&&!/けす|きえる|くりあ|りせっと|ぜんぶ/.test(r))return {schemaId:'PenCommand:STAMP'};
  if(/おと|おんがく|bgm/.test(r)&&/とめ|すとっぷ/.test(r))return {schemaId:'SoundCommand:STOP_ALL'};
  if(/おと|おんてい|ぴっち/.test(r)&&/あげ|たかく/.test(r))return {schemaId:'SoundCommand:PITCH_UP',...(n!==null?{value:n}:{})};
  if(/おと|おんてい|ぴっち/.test(r)&&/さげ|ひくく/.test(r))return {schemaId:'SoundCommand:PITCH_DOWN',...(n!==null?{value:n}:{})};
  if(/hz|へるつ/i.test(q)&&/出す|なる|鳴る/.test(q))return {schemaId:'SoundCommand:TONE_WAIT'};
  if(/おんりょう|おとのおおきさ|ぼりゅーむ/.test(r)&&number)return {schemaId:'SoundCommand:SET_VOLUME'};
  if(/(?:大きさ|おおきさ|さいず)/.test(q)&&number&&!/音|おと/.test(q))return {schemaId:'LooksCommand:SET_SCALE'};
  if(/^「[^「」]*」と(?:書く|かく)$/.test(q))return {schemaId:['label','button','box'].includes(context.targetType)?'LooksCommand:SET_SELF_TEXT':'Say'};
  if(/の(?:さいご|最後|後ろ|うしろ|おわり|終わり|末尾|最後尾|一番後ろ|おしり)に.*(?:入れ|いれ|たす|足す)/.test(q))return {schemaId:'ListAppend'};
  if(/の(?:一番前|さいしょ)に.*(?:入れ|いれ)/.test(q))return {schemaId:'ListInsert',index:1};
  // (the 番目 is the number written before 番目, not the first number of the words: 10を3番目にはさむ is the 3rd)
  const nth=/(\d+)(?:番目|ばんめ)/.exec(q),place=nth?Number(nth[1]):n;
  if(/\d+(?:番目|ばんめ).*?(?:はさむ|挟む|わりこませ|割り込ませ|入れこむ|追加する|ついかする|取りだす|取り出す|とりだす|とる|取る|外す|はずす)/.test(q))return {schemaId:/取り|とり|とる|取る|外す|はずす/.test(q)?'ListDelete':'ListInsert',index:place};
  if(/\d+(?:番目|ばんめ)は「/.test(q))return {schemaId:'ListReplace',index:place};
  if(/の(?:数|長さ|個数)を0にする/.test(q))return {schemaId:'ListClear'};
  if(/^.+を.+(?:から|で)(?:始める|はじめる|すたーとする)$/.test(q)||/^.+を.+と(?:おく|置く)$/.test(q))return {schemaId:'Assignment'};
  if(/^.+から\d+(?:へらす|減らす)$/.test(q))return {schemaId:'NumericUpdate:SUB'};
  if(/(?:いちばん|一番|最前|さいぜん)(?:前|まえ|手前|てまえ|上|うえ|面|列)/.test(q))return {schemaId:'LooksCommand:FRONT'};
  if(/(?:いちばん|一番|最背)(?:後ろ|うしろ|おく|奥|下|した|面)/.test(q))return {schemaId:'LooksCommand:BACK'};
  if(/\d+(?:つ|こ|個|層)(?:前|まえ|手前|上|うえ)/.test(q))return {schemaId:'LooksCommand:FORWARD_LAYERS',value:n};
  if(/\d+(?:つ|こ|個|層)(?:後ろ|うしろ|おく|奥|下|した|下げ)/.test(q))return {schemaId:'LooksCommand:BACKWARD_LAYERS',value:n};
  if(/反対向き|反対を向く|後ろを向く|うしろを向く|向きを反対/.test(q))return {schemaId:'MotionCommand:TURN_RIGHT',value:180};
  if(/反時計|はんとけい|左回り|ひだりまわり|左回転|ひだりかいてん/.test(q))return {schemaId:'MotionCommand:TURN_LEFT'};
  if(/時計回り|時計まわり|とけいまわり|右回り|みぎまわり|右回転|みぎかいてん/.test(q))return {schemaId:'MotionCommand:TURN_RIGHT'};
  if(direction.length===1&&/回[るりっすし転]|まわ|かいてん|曲が|まが|たーん|ひね|かたむ|傾/.test(q))
    return {schemaId:direction[0][0]==='left'?'MotionCommand:TURN_LEFT':'MotionCommand:TURN_RIGHT'};
  if(direction.length===1&&/向[くき]|む[くき]|向き|向きになる|を見る/.test(q)){
    if(/\d+度/.test(q)&&['right','left'].includes(direction[0][0])&&!/向きを\d/.test(q))return {schemaId:direction[0][0]==='left'?'MotionCommand:TURN_LEFT':'MotionCommand:TURN_RIGHT'};
    return {schemaId:'MotionCommand:SET_DIRECTION',direction:direction[0][0],value:({right:90,left:-90,up:0,down:180} as const)[direction[0][0]]};
  }
  if(/(?:向き|むき|方向).*\d|\d+(?:度|ど)(?:を|に)(?:向く|むく)/.test(q))return {schemaId:'MotionCommand:SET_DIRECTION'};
  if(/x(?:座標)?を\d+、?y(?:座標)?を\d+/i.test(q)||/画面の左下のはしから|(?:座標|ざひょう)[(（]|よこ\d+、たて\d+|右へ\d+(?:歩)?、上へ\d+(?:歩)?のばしょ/.test(q))return {schemaId:'MotionCommand:GOTO'};
  if(/^いまのばしょから/.test(q)&&/動く|うごく/.test(q)&&!direction.length)return {schemaId:'MotionCommand:MOVE_BY',direction:'right'};
  if(/\d+秒(?:間)?(?:休|やす|休憩|きゅうけい|休けい|待機|たいき|お休み|おやすみ|止ま|とま|停止|静止|すとっぷ|ぽーず|うぇいと|じっと|だま|そのまま|寝|ね|眠|ねむ|すわ|座|たつ|たった|経つ)/.test(q))return {schemaId:'WaitTime'};
  if(/^(?:少し|すこし|ちょっと|しばらく)(?:待つ|まつ)$/.test(q))return {schemaId:'WaitTime',value:1};
  if(/^\d+(?:\.\d+)?(?:秒|びょう)(?:を)?(?:待|まち|まつ)/.test(q))return {schemaId:'WaitTime'};
  if(/^\d+(?:\.\d+)?(?:秒|びょう)(?:ぐらい|くらい|のあいだ)?(?:待つ|まつ|うえいと|あける)$/.test(q))return {schemaId:'WaitTime'};
  if(/^(?:ゆっくり|のんびり)(?:待つ|まつ)$/.test(q))return {schemaId:'WaitTime',value:1};
  if(/^\d+回(?:くり返|繰り返|くりかえ|やる|する|(?:同じ|おなじ)ことをする)/.test(q))return {schemaId:'RepeatCount'};
  if(/(?:音楽|曲|bgm|おんがく|きょく).*かけ|(?:鳴らし|ならし)(?:おわる|終わる)まで(?:待つ|まつ)/.test(q))return {schemaId:'SoundCommand:SAMPLE_WAIT'};
  if(/みゅーと|消音/.test(q))return {schemaId:'SoundCommand:SET_VOLUME',scale:0};
  if(/(?:音量|ぼりゅーむ|音の大きさ).*(?:上げ|あげ|あっぷ|下げ|さげ|だうん)/.test(q))return {schemaId:'SoundCommand:SET_VOLUME',scale:/下げ|さげ|だうん/.test(q)?50:100};
  if(/ふくら|巨大|でかく|でっかく|びっぐ/.test(q))return {schemaId:'LooksCommand:SET_SCALE',scale:150};
  if(/みに/.test(q))return {schemaId:'LooksCommand:SET_SCALE',scale:50};
  if(/(?:もと|元)の大きさ|大きさ.*(?:もと|元)|もとどおり/.test(q))return {schemaId:'LooksCommand:SET_SCALE',scale:100};
  if(/重なり.*(?:上げ|あげ)/.test(q))return {schemaId:'LooksCommand:FORWARD_LAYERS'};
  if(/重なり.*(?:下げ|さげ)/.test(q))return {schemaId:'LooksCommand:BACKWARD_LAYERS'};
  if(/まっか/.test(q))return {schemaId:'LooksCommand:SET_COLOR',color:'赤'};
  if(/半分/.test(q)&&/音|おと|声|こえ|音量|ぼりゅーむ/.test(q))return {schemaId:'SoundCommand:SET_VOLUME',scale:50};
  if(/ちぢ|ちっちゃく|ちいちゃく|半分/.test(q))return {schemaId:'LooksCommand:SET_SCALE',scale:50};
  if(/大きさ.*(?:もどす|戻す|りせっと)/.test(q))return {schemaId:'LooksCommand:SET_SCALE',scale:100};
  // (a number found gives n)
  if(number&&/(?:倍|ばい)/.test(q))return {schemaId:'LooksCommand:SET_SCALE',scale:n!*100};
  const color=penColor;
  if(color)return {schemaId:/ぺん|線|せん|かく/.test(q)?'PenCommand:SET_COLOR':'LooksCommand:SET_COLOR',color:colorName(color[1])};
  if(colors.size>1)return {schemaId:/ぺん|線|せん|かく/.test(q)?'PenCommand:SET_COLOR':'LooksCommand:SET_COLOR'};
  const motion=/行[くき]|い[くき]|進[むみ]|すす[むみ]|動[くきか]|うご[くきか]|移動|いどう|のぼる|上がる|あがる|おちる|落ちる|ずれる|とぶ|さがる|下がる|すらいど|ずらす|おりる|降りる|よける|走る|はしる|だっしゅ|わーぷ|じゃんぷ|うつる|移る|もぐる|潜る|すきっぷ|走りぬける|かけだす|とびあがる|とびおりる|ころがる|歩く|あるく|踏み出す|ふみだす|泳ぐ|およぐ/;
  if(/あいだ|間/.test(q)&&motion.test(q))return {schemaId:'ContinuousRule',direction:direction[0]?.[0]||'right'};
  // (左右 is よこ and 上下 is たて; a diagonal, not of a corner of the screen, gives the block with no direction asked for)
  const axis=/(?:よこ|横|たて|縦)/.test(q)?(/よこ|横/.test(q)?'x':'y'):/(?:右|みぎ)(?:左|ひだり)|(?:左|ひだり)(?:右|みぎ)/.test(q)?'x':/(?:上|うえ)(?:下|した)|(?:下|した)(?:上|うえ)/.test(q)?'y':null;
  if(axis&&motion.test(q)&&!/回|まわ|向|むく/.test(q))return {schemaId:'MotionCommand:MOVE_BY',direction:axis==='x'?'right':'up',directions:axis==='x'?['right','left']:['up','down']};
  const corner=/はし|端|すみ|かど|角/.test(q);
  if(!direction.length&&oneWays!==q&&!corner&&/向[くき]|む[くき]/.test(q))return {schemaId:'MotionCommand:SET_DIRECTION'};
  if(!direction.length&&oneWays!==q&&!corner&&motion.test(q))return {schemaId:'MotionCommand:MOVE_BY'};
  if(/(?:前|まえ|前方|先)(?:へ|に)|まっすぐ/.test(q)&&!/(?:手前|てまえ)/.test(q)&&motion.test(q))return {schemaId:'MotionCommand:MOVE',direction:'forward'};
  if(/(?:前|まえ)(?:へ|に)出る/.test(q)&&!/(?:手前|てまえ)/.test(q))return {schemaId:'MotionCommand:MOVE',direction:'forward'};
  if(/^(?:前|まえ)(?:へ|に)\d+(?:歩|ほ|ぽ)$/.test(q))return {schemaId:'MotionCommand:MOVE',direction:'forward'};
  if(/(?:後ろ|うしろ)(?:へ|に)(?:下がる|さがる)/.test(q))return {schemaId:'MotionCommand:MOVE',direction:'backward'};
  if(/後退|こうたい|ばっく|(?:後ろ|うしろ).*(?:もど|戻|動|進)|(?:もどる|戻る)/.test(q)&&/\d+(?:歩|ほ|ぽ)/.test(q))return {schemaId:'MotionCommand:MOVE',direction:'backward'};
  if(direction.length===1&&(motion.test(q)||/\d+(?:歩|ほ|ぽ)/.test(q))&&!/回|まわ|向[くき]/.test(q))return {schemaId:'MotionCommand:MOVE_BY',direction:direction[0][0]};
  if(/じゃんぷ|とぶ|とびはねる/.test(q))return {schemaId:'MotionCommand:MOVE_BY',direction:'up'};
  if (direction.length === 1 && /行[くき]|い[くき]|進[むみ]|すす[むみ]|動[くきか]|うご[くきか]|移動/.test(q)
    && !/回|まわ|向[くき]|む[くき]/.test(q))
    return {schemaId:'MotionCommand:MOVE_BY', direction:direction[0][0]};
  // 音を小さく／大きく is the sound's 大きさ. A comparison (より小さい) and the pen's 太さ are found by their own words.
  const smaller = /小さ|ちいさ|縮小|縮め/.test(q), larger = /大きく|おおきく|拡大/.test(q),
    other = /より|くらべ|比べ|ぺん|太さ|ふとさ/.test(q);
  if (((smaller || larger) && /音|おと|声|こえ|ぼりゅーむ/.test(q) || /^(?:ぼりゅーむ)$/.test(q))&&!/言う|いう|話す/.test(q)) return {schemaId:'SoundCommand:SET_VOLUME', scale:smaller ? 50 : 100};
  if (smaller && !other) return {schemaId:'LooksCommand:SET_SCALE', scale:50};
  if (larger && !other) return {schemaId:'LooksCommand:SET_SCALE', scale:150};
  if (/(?:番目|ばんめ)/.test(q) && /入[れる]|いれ|挿入|そうにゅう/.test(q) && !/置き換|おきか|替え/.test(q)) {
    const match = q.match(/(\d+)(?:番目|ばんめ)/), index = match ? Number(match[1]) : null;
    // (isSafeInteger: the place is a number)
    return {schemaId:'ListInsert', ...(Number.isSafeInteger(index) && index! >= 1 ? {index} : {})};
  }
  return null;
}
