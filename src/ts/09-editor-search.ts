import { EVENT_BY_TYPE, cpLen, hintCandidates, keySurface, resolveColor } from './02-language-contracts.ts';
import { buildSymbols, nameSource } from './03-default-assets.ts';
import { CONDITION_FORMS, SENTENCE_FORMS, parseCondition, parseExpression, parseSyntax, sentenceFormFor, sentenceRoleSlots } from './04-syntax-expressions.ts';
import { KEY_ALIASES, KEY_WORDS, SENTENCE_TE_FORMS, inTurnAction, inTurnLabel, keyWord, readSentenceHeading, sentenceActorSource, sentenceHeadingSource, sentenceQuantity } from './04-syntax-sentences.ts';
import { MEIJIN_WORD, meijinDictionary, meijinRewrite, meijinWordCheck, meijinWordSpelling, meijinWordTest } from './04-meijin-syntax.ts';
import { BLOCK_SCHEMAS, BLOCK_SCHEMA_BY_ID, blockDecode, createBlock, syntaxSchema } from './05-command-presentation.ts';
import { formatScript } from './06-source-formatting.ts';
import { collectSignalNames, documentSyntaxItems } from './07-semantic-analysis-core.ts';
import { analyzeAst, compileProject } from './07-semantic-analysis.ts';
import { BASIC_BLOCK_SCHEMA_IDS, searchReading } from './09-editor-sessions.ts';
import { BLOCK_SEARCH_SYNONYMS, configureSearchNode, hintSchemaId, holdFirst, keyedSearchCandidate, matchesSearch, nodeForSearchHint, searchIntent, searchKey, searchQueryVariants } from './09-editor-search-core.ts';
import type { AssistCandidate, AssistCanonical, AssistContext, AssistData, AssistExtra, AssistFilled, AssistGot, AssistHint, AssistListed, AssistMeaning, AssistName, AssistNameKind, AssistNode, AssistNumber, AssistPiece, AssistPoolEntry, AssistQuantity, AssistRange, AssistRanked, AssistRow, AssistSeed, AssistSource, AssistWant } from '../types/assist.d.ts';
import type { BlockSchema } from '../types/blocks.d.ts';
import type { Diagnostic, Symbols } from '../types/compiled.d.ts';
import type { Proposal } from '../types/runtime.d.ts';
import type { Hint, SearchCandidate, SearchIntent } from '../types/editor.d.ts';
import type { ParseContext, RoleSlot, SentenceNode } from '../types/parse.d.ts';
import type { Project } from '../types/project.d.ts';
import type { ActorRef, Heading, UnfilteredHeading } from '../types/syntax-base.d.ts';
import type { Expression, Script, Statement } from '../types/syntax.d.ts';

// ────────────────────────────────────────────────────────────────────────
// 09 — Editor search hints and input assistance
// ────────────────────────────────────────────────────────────────────────

// 書ける ことば finds a sentence by the same words as its block (F2-11): ランダム finds 1から2のどれか.
function hintSearchSynonyms(id: string) {
  const schemaId = hintSchemaId(id), builtin = /^builtin:(.+)$/.exec(schemaId);
  return (builtin ? BLOCK_SEARCH_SYNONYMS['BuiltinCall:' + builtin[1]] : BLOCK_SEARCH_SYNONYMS[schemaId]) || [];
}
export function searchHintCandidates(candidates: Hint[], query: string, project?: Project | null, context: ParseContext = {}) {
  if (!query.trim()) return candidates;
  const intent = searchIntent(query, context), matched = candidates.filter(h => intent
    ? (h.binding && matchesSearch(h.binding.name, query)) || hintSchemaId(h.id) === intent.schemaId
    : matchesSearch(h.text + ' ' + h.category + ' ' + h.searchTerms.join(' ') + ' ' + hintSearchSynonyms(h.id).join(' '), query));
  return matched.map(h => {
    if (!intent || !project) return h;
    // (a value's hint makes no sentence: the format throws and the hint stays as it is)
    try { const node = nodeForSearchHint(h, project, context, intent);
      return {...h, text:formatScript({kind:'Script',body:[blockDecode(node) as Statement]},{symbols:buildSymbols(project)})};
    } catch (_) { return h; }
  }).sort((a,b) => Number(!!b.binding) - Number(!!a.binding) || holdFirst(b.id, query) - holdFirst(a.id, query));
}
export function blockSearchCandidates(project: Project, context: ParseContext, query: string, hints: Hint[]): SearchCandidate[] {
  const schemas = BLOCK_SCHEMAS.filter(s => !s.draftOnly && ['statement','expression'].includes(s.category));
  if (!query.trim()) return schemas;
  const intent = searchIntent(query, context), out: SearchCandidate[] = [], boundSchemas = new Set<string>();
  for (const hint of searchHintCandidates(hints, query, project, context)) {
    if (!hint.binding) continue;
    try {
      const candidateNode = nodeForSearchHint(hint, project, context, intent), schema = BLOCK_SCHEMA_BY_ID.get(candidateNode.schemaId);
      if (!schema || !schemas.includes(schema)) continue;
      out.push({...schema, candidateNode, binding:hint.binding, searchLabel:hint.text,
        candidateKey:hint.id, candidateReason:hint.reason}); boundSchemas.add(schema.id);
    } catch (_) { /* An unavailable incomplete hint remains visible through the generic schema. */ }
  }
  // The block of the intent comes first, set as asked; the blocks the words name stay after it (E-13: 小さい finds より小さい too).
  for (const schema of schemas) {
    if (boundSchemas.has(schema.id)) continue;
    const intended = intent && schema.id === intent.schemaId;
    if (!intended && !matchesSearch(blockPaletteSearchText(schema), query)) continue;
    const configured = intended && (intent.direction || intent.scale !== undefined || intent.index !== undefined || typeof intent.value === 'number' || !!intent.color || !!intent.empty);
    out.push(configured ? {...schema, candidateNode:configureSearchNode(createBlock(schema.id, {
      draft:schema.inputs.some(s=>s.type==='target'), allowHoles:true}), intent)} : schema);
  }
  // よく使う blocks first, then the ones whose name starts with the word (or has it right after a particle): まつ
  // finds 秒待つ before …まで待つ (E-13). The order is otherwise kept.
  const words = searchQueryVariants(query).map(searchReading).filter(word => [...word].length >= 2 || word === searchReading(query));
  const marks = ['を', 'に', 'の', 'で', 'と', 'へ', 'が', 'は', 'て', '、', '・', 'びょう', 'かい', 'ばんめ'];
  const wordStart = (schema: SearchCandidate) => {
    const names = [schema.searchLabel, schema.label].filter(Boolean).map(searchReading);
    if (words.some(word => names.some(name => name.startsWith(word)))) return 0;
    return words.some(word => names.some(name => marks.some(mark => name.includes(mark + word)))) ? 1 : 2;
  };
  // How the word is found in the block's own words (its name, its search words, a bound name): 0 a whole word, 1 the
  // start of a word, 2 only inside another word (てん in かいてん, ど in いどう, かく in かくす) or only in the words
  // a whole family of blocks shares (線をかく・スタンプをおす for every ペン block). 2 comes after every other block
  // (E-13). A verb written whole (かく, おす) is not the start of a longer one.
  const kana = /[ぁ-ゟ゠-ヿ]/, verb = /[うくぐすつぬぶむる]$/, particles = marks.slice(0, 11);
  const found = (text: string, word: string) => {
    if (text === word) return 0;
    for (let at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + 1)) {
      const before = text.slice(0, at), after = text[at + word.length];
      if ((!before || !/[\p{L}ー]$/u.test(before) || particles.some(mark => before.endsWith(mark))) && !(verb.test(word) && after && kana.test(after))) return 1;
    }
    return 2;
  };
  const quality = (schema: SearchCandidate) => {
    const own = [schema.searchLabel, schema.label, schema.binding?.name,
      ...((BLOCK_SEARCH_SYNONYMS[schema.id] || BLOCK_SEARCH_SYNONYMS[schema.kind]) || [])].filter(Boolean).map(searchReading);
    return Math.min(2, ...words.flatMap(word => own.map(text => found(text, word))));
  };
  const rank = (schema: SearchCandidate) => { if (intent && schema.id === intent.schemaId) return -1; const q = quality(schema); if(searchReading(query)==='ひく'&&['NumericUpdate:SUB','BinaryExpression:SUB'].includes(schema.id))return -1;return (q === 2 ? 60 : 0) + (BASIC_BLOCK_SCHEMA_IDS.has(schema.id) ? 0 : 30) + (q ? 10 : 0) + wordStart(schema); };
  out.splice(0, out.length, ...out.map((schema, i) => ({ schema, i, r: rank(schema) })).sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.schema));
  // A key named in the search (スペース, エンター …): the blocks that wait for it, repeat until it is pressed and read it
  // come first, with that key (F2-11).
  const key = searchKey(query);
  if (key) {
    const keyed = ['WaitUntil', 'RepeatUntil', 'SensorRead:KEY_DOWN'].map(id => keyedSearchCandidate(id, key, project)).filter(Boolean);
    out.splice(0, out.length, ...keyed, ...out.filter(s => !keyed.some(k => k.id === s.id)));
  }
  // The continuous rule is no statement: search finds it too, and the palette puts it in the body's rules.
  const rule = BLOCK_SCHEMA_BY_ID.get('ContinuousRule');
  if (rule && matchesSearch(blockPaletteSearchText(rule), query)) out.splice(holdFirst(rule.id, query) ? 0 : out.length, 0, rule);
  return out;
}
const ASSIST_MAX=4, ASSIST_FULL_PARSE_CHARS=4000, ASSIST_BUDGET_MS=300;
function assistSplit(text: string, separators='、。') {
  const out: AssistPiece[]=[];let start=0,stack: string[]=[];
  const pairs={'「':'」','【':'】','（':'）','(' : ')','『':'』','｢':'｣','［':'］'};
  for(let i=0;i<text.length;i++){
    // (a character that opens nothing: undefined)
    const c=text[i];if(pairs[c as keyof typeof pairs] as string | undefined)stack.push(pairs[c as keyof typeof pairs]);else if(stack.at(-1)===c)stack.pop();
    else if(!stack.length&&separators.includes(c)){out.push({text:text.slice(start,i),start,end:i});start=i+1;}
  }
  out.push({text:text.slice(start),start,end:text.length});return out.filter(x=>x.text.trim());
}
function assistNumberText(text: unknown) {
  // A § written is kept as a quote too, so only the marks made here are put back (§0§ written stays as it is).
  const quotes: string[]=[],protectedText=String(text).replace(/「[^「」]*」|【[^【】]*】|『[^『』]*』|｢[^｢｣]*｣|["‘’][^"‘’]*["‘’]|（[^（）]*）|\([^()]*\)|〈[^〈〉]*〉|《[^《》]*》|［[^［］]*］|\[[^\[\]]*\]|§/g,s=>'§'+(quotes.push(s)-1)+'§');
  let s=protectedText.normalize('NFKC').replace(/(?<=\d),(?=\d{3})/g,'');
  s=s.replace(/じゅっ|じゅう|きゅう|はち|なな|ろく|ご|よん|し|さん|に|いち/g,(m: string,at: number,full: string)=>{
    // Kana numbers are quantities only immediately before a known unit.
    if(at&&!/[はがをにへとで、 ]$/.test(full.slice(0,at)))return m;
    if(!/^(?:びょう|秒|歩|ほ|ぽ|回|かい|度|ど|つ(?!づ)|番)/.test(full.slice(at+m.length)))return m;
    // (the pattern takes only the words of the table)
    return ({じゅっ:'10',じゅう:'10',きゅう:'9',はち:'8',なな:'7',ろく:'6',ご:'5',よん:'4',し:'4',さん:'3',に:'2',いち:'1'} as { readonly [word: string]: string })[m];
  });
  s=s.replace(/[一二三四五六七八九十百千]+(?=歩|秒|度|％|回|番|つ|個|体|匹|人|こ)/g,(word: string,at: number,full: string)=>{
    if(word==='一'&&/^番(?:手前|前|奥|おく|後ろ|うしろ|上|下)/.test(full.slice(at+word.length)))return word;
    // (a digit is in no table of units: undefined)
    const digits='〇一二三四五六七八九',units={十:10,百:100,千:1000};let total=0,n=0;
    for(const c of word)if(units[c as keyof typeof units] as number | undefined){total+=(n||1)*units[c as keyof typeof units];n=0;}else n=digits.indexOf(c);return total+n;
  });return s.replace(/§(\d+)§/g,(_: string,i: `${number}`)=>quotes[i]);
}
export function assistSeeds(code: unknown, symbols: Symbols | null | undefined, ctx: AssistContext={}): AssistData {
  const project=symbols?.project, components=project?.components||[],names: AssistName[]=[];
  const addNames=(values: readonly { name?: string }[] | undefined,kind: AssistNameKind)=>{for(const v of values||[])if(v?.name)names.push({name:v.name,kind});};
  addNames(components,'part');addNames(project?.sounds,'sound');addNames(project?.stage?.backdrops,'backdrop');
  addNames(project?.projectData?.variables,'variable');addNames(project?.projectData?.lists,'list');
  addNames(project?.actions,'action');addNames(project?.functions,'function');
  for(const c of components)if(c.id===ctx.targetId){addNames(c.costumes,'costume');addNames(c.localData?.variables,'variable');addNames(c.localData?.lists,'list');}
  addNames((ctx.args||[]).map(name=>({name})),'argument');addNames([...(ctx.localNames||[])].map(name=>({name})),'local');
  let text=assistNumberText(String(code).trim().replace(/[。、，．…〜♪]+$/u,'')), subject: string | null=null;
  const listed=assistListedSubjects(text,project);
  for(const name of ['自分','体',...components.map(c=>c.name)].sort((a,b)=>b.length-a.length)){
    const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), m=new RegExp('^(?:「'+escaped+'」|'+escaped+')(?:[はが]、?|[、\\s]+|の(?=向き|大きさ|すがた|音|色|ばしょ|文字|中身|見た目|ペン))').exec(text);
    if(m){subject=name;text=text.slice(m[0].length);break;}
  }
  // (one of the patterns' groups is the quoted text)
  const stringValues=[...text.matchAll(/「([^「」]*)」|『([^『』]*)』|｢([^｢｣]*)｣|["‘’]([^"‘’]*)["‘’]|（([^（）]*)）|\(([^()]*)\)|〈([^〈〉]*)〉|《([^《》]*)》|［([^［］]*)］|\[([^\[\]]*)\]/g)].map(m=>({value:m.slice(1).find(x=>x!==undefined) as string,at:m.index,end:m.index+m[0].length})),strings=stringValues.map(s=>s.value);
  const nameText=text.replace(/^もし、?/,'');
  const extractedNames=names.filter(n=>strings.includes(n.name)||text.includes('【'+n.name+'】')||new RegExp('(?:^|[はがをにへとので、 ])'+n.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:$|[はがをにへとので、 ])').test(nameText));
  for(const name of names.filter(n=>['action','function'].includes(n.kind)))if(!extractedNames.includes(name)&&new RegExp(name.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:させ|する|して|という)').test(text))extractedNames.push(name);
  if(text.includes('マウス'))extractedNames.push({name:'マウス',kind:'part'});
  let outside=text;for(const s of stringValues)outside=outside.slice(0,s.at)+' '.repeat(s.end-s.at)+outside.slice(s.end);outside=outside.replace(/【[^【】]*】/g,s=>' '.repeat(s.length));
  const keys=[...new Set(strings.map(keyWord).filter(Boolean))];
  for(const word of [...Object.keys(KEY_ALIASES),...KEY_WORDS].sort((a,b)=>b.length-a.length)){
    const escaped=word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    if(new RegExp('(?:^|の)'+escaped+'(?:矢印キー|やじるしキー|キー|(?=[をが]))').test(outside)){const key=keyWord(word);if(key&&!keys.includes(key))keys.push(key);}
  }
  const numbers: AssistNumber[]=[],unitNames={歩:'歩',ほ:'歩',ぽ:'歩',ホ:'歩',ドット:'歩',step:'歩',ステップ:'歩',秒:'秒',びょう:'秒',s:'秒',sec:'秒',度:'度',ど:'度','°':'度','%':'％','％':'％',パーセント:'％',ぱーせんと:'％',パー:'％',Hz:'Hz',hz:'Hz',HZ:'Hz',ヘルツ:'Hz',回:'回',かい:'回',番目:'番目',番め:'番目',ばんめ:'番目',つ目:'番目',つめ:'番目',こめ:'番目',個目:'番目',番:'番目',段:'段階',段階:'段階',つ:'つ',こ:'つ',個:'つ',層:'つ',体:'count',匹:'count',人:'count',px:null,ピクセル:null};
  for(const m of outside.matchAll(/(-?\d+(?:\.\d+)?)([A-Za-z%％°ァ-ヶぁ-ゖ一-龯]*)(?:半|はん)?/g)){
    let unit=Object.keys(unitNames).sort((a,b)=>b.length-a.length).find(u=>m[2].startsWith(u));
    if(m[2]&&!unit&&!/^(?:[をにへとでがは]|から|まで|より|なら)/.test(m[2])&&!searchQueryVariants(m[2]).some(form=>(Object.values(BLOCK_SEARCH_SYNONYMS).flat() as string[]).some(word=>form.startsWith(word))))continue;const suffix=outside.slice(m.index+m[1].length+(unit?.length||0));
    // (the unit is a key of the table)
    numbers.push({value:Number(m[1])+(/^(?:半|はん)/.test(suffix)&&(!unit||unitNames[unit as keyof typeof unitNames]==='秒')?0.5:0),unit:unit?unitNames[unit as keyof typeof unitNames]:null,at:m.index,end:m.index+m[1].length});
  }
  let clauseText='',stack: string[]=[];
  const pairs={'「':'」','【':'】','『':'』','｢':'｣'},teWords=[...SENTENCE_TE_FORMS].map(([te])=>te).sort((a,b)=>b.length-a.length);
  for(let i=0;i<text.length;i++){
    // (a character that opens nothing: undefined)
    const c=text[i];if(pairs[c as keyof typeof pairs] as string | undefined)stack.push(pairs[c as keyof typeof pairs]);else if(stack.at(-1)===c)stack.pop();clauseText+=c;if(stack.length)continue;
    const before=text.slice(0,i+1),after=text.slice(i+1);
    if(/^[、。]/.test(after)||!after)continue;
    if((teWords.some(te=>before.endsWith(te))&&!/^(?:ください|ね|よ|ほしい|くれ|いる|いれ|いな|いた|います|おく|おいて|しまう)/.test(after))||/[てで]$/.test(before)&&after.startsWith('から'))clauseText+='、';
    else if(/[うくぐすつぬぶむる]$/.test(before)&&after.startsWith('そして'))clauseText+='、';
  }
  const clauses=assistSplit(clauseText,'、').map(x=>({...x,text:x.text.replace(/^(?:から|そして|それから|それで|つぎに|次に)/,'')}));
  // Parts written together after a clause (…して、ねこと犬は…) do only that clause, which no sentence for each keeps.
  const subjects=listed??(clauses.slice(1).some(c=>assistListedSubjects(c.text,project))?{parts:[],particle:'は',rest:null}:null);
  const seeds: AssistSeed[]=[],seen=new Set<string>(),add=(word: string,rank: number,fragment=false)=>{word=word.trim();if(!word||seen.has(word)||/^(?:する|なる|ある|いる|それ|これ|あれ|となり|少し)$/.test(word))return;seen.add(word);seeds.push({text:word,rank,fragment});};
  for(const [raw,rank]of [[text,0] as const,...clauses.map((c,i)=>[c.text,i===clauses.length-1?1:i+2] as const)]){
    const clean=raw.replace(/「[^「」]*」|『[^『』]*』|｢[^｢｣]*｣|"[^"]*"/g,'');
    add(clean,rank);add(clean.replace(/(?:をする|をやる|する)$/,''),rank);
    for(const v of searchQueryVariants(clean,{condition:/(?:たら|と|れば|なら|とき|たとき|あいだ|間|まで)$/.test(clean)}))add(v,rank);
    for(const m of clean.matchAll(/(?:^|[、])(.+?)[をはが]/g))add(m[1],rank);
    for(const word of [clean,...searchQueryVariants(clean)].flatMap(form=>form.replace(/\d+(?:\.\d+)?(?:cm|センチ|メートル|マス|ぽ|ほ)/g,'').replace(/という|として|とともに|といっしょに/g,m=>m.replace(/と/g,'\u0002')).split(/[をにへとでがはの、\d]+|歩|秒|度|％|回|番目/))){
      const w=word.replace(/\u0002/g,'と');add(w,rank,true);add(w.replace(/(?:をする|をやる|する)$/, ''),rank,true);for(const v of searchQueryVariants(w))add(v,rank,true);
    }
  }
  for(const m of text.matchAll(/【([^【】]+)】/g))add(m[1],0,true);
  for(const key of keys)add(keySurface(key),0,true);
  for(const number of numbers)if(number.unit)add(String(number.value)+number.unit,0,true);
  // (each block in the table has its words)
  for(const word of new Set(Object.values(BLOCK_SEARCH_SYNONYMS).flat() as string[]))if(word.length>2&&word.endsWith('も')&&searchReading(text).startsWith(searchReading(word))){add(word,0);add(text.slice(word.length),0,true);}
  const headerEvent=(!/^もし/.test(text)||/(?:おされた|おした)とき$/.test(text))&&/(?:とき(?:に)?|時|たびに|ごとに|たら)(?:、.*)?$/.test(text)?/合図/.test(text)?'message':/(?:はいけい|背景).*(?:かわ|変わ|かえ|切り)/.test(text)?'backdropChanged':/コピー|クローン/.test(text)?'cloneStart':/中身.*かわ|中身.*変わ|文字が入った/.test(text)?'valueChanged':/キー|矢印/.test(text)||keys.length?'keyDown':/タップ|クリック|タッチされ|おされた|おした/.test(text)?'click':/ふれ|触れ|タッチした/.test(text)?'touchStart':/スタート|始ま|はじま|開始|実行|はじめ|作品を動かした/.test(text)?'start':null:null;
  return {text,subject,strings,stringValues,names:extractedNames,numbers,keys,clauses,seeds,headerEvent,subjects};
}
export function assistVerificationContext<T extends { key?: string; ownerKey?: string }>(ctx: T) {const {key,ownerKey,...rest}=ctx;return rest;}
function assistCanonical(text: unknown, ctx: AssistContext, previous=''): AssistCanonical | null {
  const clean=String(text).trim().replace(/。{2,}$/,'。'), variants=[clean,/、$/.test(clean)?clean+'\n  何もしない。':clean+'。',clean.replace(/、?$/,'、')+'\n  何もしない。',clean.replace(/。?$/,'。')+'\n  何もしない。',clean+'\n  何もしない。'];
  for(const source of variants){for(const prefix of ['',...(previous?[previous+'\n']:[])]){
    try{const parsed=parseSyntax(prefix+source,ctx);if(!parsed.ast)continue;let canonical=formatScript(parsed.ast).trim();
      if(prefix){canonical=canonical.split('\n').slice(prefix.trim().split('\n').length).join('\n');if(parsed.ast.body?.length>1)parsed.ast.body=parsed.ast.body.slice(1);}
      if(source!==clean&&source.endsWith('\n  何もしない。'))canonical=canonical.split('\n').slice(0,-1).join('\n');
      return {text:canonical,ast:parsed.ast};
    }catch{}
  }}return null;
}
export function assistSourceRange(basis: string, diagnostic: Pick<Diagnostic, 'line'>, ctx: AssistContext): AssistRange | null {
  // (raw is undefined past the last line; the pattern of the indent matches every line)
  const lines=basis.split('\n'), index=(diagnostic.line||1)-1, raw=lines[index] as string | undefined;if(raw===undefined)return null;
  const lineStart=lines.slice(0,index).reduce((n,s)=>n+s.length+1,0),indent=raw.match(/^\s*/)![0].length;
  let pieces=assistSplit(raw.slice(indent),'。');let piece=pieces[0];
  if(pieces.length>1)piece=pieces.find(p=>{try{return !parseSyntax(p.text+'。',ctx).ast;}catch{return true;}})||{text:raw.slice(indent),start:0,end:raw.length-indent};
  if(/。\s*(?:#|＃|\/\/|／／|--|\/\*)/.test(raw))piece={text:raw.slice(indent),start:0,end:raw.length-indent};
  if(!piece)return null;return {start:lineStart+indent+piece.start,end:lineStart+indent+piece.end,lineStart,lineEnd:lineStart+raw.length,indent,line:index+1,text:piece.text};
}
function assistHeadings(project: Project, ctx: AssistContext, data: AssistData) {
  if(ctx.definitionKind||ctx.meijin||ctx.targetId==='stage')return [];
  const owner=project.components.find(c=>c.id===ctx.targetId);if(!owner)return [];
  const key=data.keys[0],touch=data.text.includes('画面のはし')?'端':data.names.find(n=>n.kind==='part'&&n.name!==owner.name)?.name||project.components.find(c=>c.id!==owner.id)?.name||'端';
  const inputs=project.components.filter(c=>c.type==='input');
  const out: AssistHint[]=[];
  for(const event of new Set(Object.values(EVENT_BY_TYPE).flat())){
    if(event==='interval'||event==='conditionTrue')continue;
    if(['click','cloneStart'].includes(event)&&data.names.some(n=>n.kind==='part'&&n.name!==owner.name))continue;
    if(event!=='valueChanged'&&data.subject&&data.subject!==owner.name&&!['自分','体'].includes(data.subject))continue;
    const variants: ({ name: string; message?: never } | { message: string; name?: never } | { name?: never; message?: never })[]=event==='valueChanged'?(data.names.some(n=>n.kind==='part')?inputs.filter(input=>data.names.some(n=>n.name===input.name)):inputs):event==='message'?(data.strings.length?data.strings.map(message=>({message})):[{}]): [{}];
    for(const variant of variants){
      // (a change of value is of an input field, which has its name; a filter of a key or a message may not be known yet)
      const actorRef: ActorRef=event==='valueChanged'?{kind:'named',name:variant.name as string}:data.subject===owner.name&&!['keyDown','message'].includes(event)?{kind:'named',name:owner.name}:{kind:'self'};
      try{const text=sentenceHeadingSource({event,actorRef,filter:event==='keyDown'?(key?{key}:null):event==='message'?(variant.message!==undefined?variant:null):event==='touchStart'?{target:touch}:null} as Heading | UnfilteredHeading);
        out.push({id:'Heading:'+event,text,mode:'statement',enabled:true,terms:{text:[text],synonyms:BLOCK_SEARCH_SYNONYMS['Heading:'+event]||[],verbForms:[],nounForms:[],intent:[],acceptedReadings:[]}});
      }catch{}
    }
  }return out;
}
function assistSlotNameKind(slot: Pick<RoleSlot, 'label'>) {
  return ({音:'sound',すがた:'costume',はいけい:'backdrop',部品:'part',入力らん:'part',行く相手:'part',向く相手:'part',コピーの元:'part',リスト:'list',調べるリスト:'list',かえるもの:'variable'} as Partial<Record<string, AssistNameKind>>)[slot.label];
}
function assistFillHint(hint: AssistHint, data: AssistData, project: Project, ctx: AssistContext, intent: SearchIntent | null=null): AssistFilled | null {
  // A sentence being filled, and a value in one of its places, by the members the filling reads and sets (any of them
  // may be there).
  type Place = { kind?: string; op?: string; unit?: string; name?: string; value?: unknown; [key: string]: unknown };
  type FillNode = Place & { kind: string; args?: Expression[]; condition?: Expression };
  const parsed=assistCanonical(hint.text,ctx);if(!parsed)return null;
  const ast=parsed.ast, node=ast.body?.[0] as FillNode | undefined||ast.rules?.[0] as FillNode | undefined;if(!node||hint.id.startsWith('Heading:'))return {...hint,text:parsed.text,filled:0};
  if(node.kind==='Say'&&data.numbers.some(n=>n.unit==='秒'))node.seconds=sentenceQuantity({kind:'NumberLiteral',value:data.numbers.find(n=>n.unit==='秒')!.value},'秒');
  // (a path has a last key; what a place holds is a value or nothing)
  const filled=new Set<string>(),boundKinds=new Set<AssistNameKind>(),slots=sentenceRoleSlots(node.kind,node.op,node.seconds?'timedSpeech':null),get=(o: unknown,p: string)=>p.split('.').reduce<unknown>((v,k)=>(v as Place | undefined)?.[k],o) as Place | undefined,put=(o: Place,p: string,v: unknown)=>{const keys=p.split('.');for(const k of keys.slice(0,-1)){if(!o[k])return false;o=o[k] as Place;}o[keys.at(-1)!]=v;return true;};
  const literal=(value: number): Expression=>value<0?{kind:'UnaryExpression',op:'NEG',value:{kind:'NumberLiteral',value:-value}}:{kind:'NumberLiteral',value},isNumber=(node: Place | undefined)=>node?.kind==='NumberLiteral'||node?.kind==='QuantityLiteral'&&(node.value as Place | undefined)?.kind==='NumberLiteral';
  const numberAt=(slot: Pick<RoleSlot, 'path'>,value: number)=>{const old=get(node,slot.path),changed=put(node,slot.path,old?.kind==='QuantityLiteral'?{...old,value:literal(value)}:literal(value));if(changed)filled.add(slot.path);return changed;};
  if(intent){
    if(intent.schemaId==='MotionCommand:MOVE_BY'&&intent.direction){const vertical=['up','down'].includes(intent.direction);if(vertical&&node.x){node.y=node.x;delete node.x;}node[vertical?'yDir':'xDir']=intent.direction;}
    else if(intent.direction&&('direction'in node))node.direction=intent.direction;
    if(intent.scale!==undefined&&node.args?.[0])numberAt({path:'args.0'},intent.scale);
    if(intent.schemaId==='MotionCommand:SET_DIRECTION'&&intent.direction){
      // (a direction ahead or behind has no side of the screen: undefined)
      const word=({right:'右',left:'左',up:'上',down:'下'} as Partial<Record<string, string>>)[intent.direction],directionAst=parseSyntax('画面の'+word+'を向く。',ctx).ast;
      // (the sentence read is a turn, whose arguments are values)
      if(directionAst?.body?.[0]?.args)node.args=directionAst.body[0].args as Expression[];
    // (a number or a place asked for is written with its digits)
    }else if(intent.value!==undefined){const s=slots.find(s=>s.type==='expression'&&isNumber(get(node,s.path)));if(s)numberAt(s,intent.value!);}
    if(intent.color&&node.args?.[0])node.args[0]={kind:'StringLiteral',value:intent.color};
    if(intent.index!==undefined&&node.index)numberAt({path:'index'},intent.index!);
    if(intent.empty&&node.args?.[1])node.args[1]={kind:'StringLiteral',value:''};
  }
  const used=new Set<number>(),slotUnit=(s: RoleSlot)=>s.unit||get(node,s.path)?.unit||({いくつ:'つ',音の高さ:'段階'} as Partial<Record<string, string>>)[s.label];
  for(const s of slots){if(s.type!=='expression')continue;const old=get(node,s.path);if(!old)continue;
    const number=data.numbers.find((n,i)=>!used.has(i)&&n.unit&&n.unit===slotUnit(s));
    if(number&&isNumber(old)){numberAt(s,number.value);used.add(data.numbers.indexOf(number));filled.add(s.path);}
  }
  const nameKinds=new Set(slots.map(assistSlotNameKind).filter(Boolean)),values=data.strings.filter(value=>!data.names.some(name=>name.name===value&&nameKinds.has(name.kind)));
  const stringSlots=slots.filter(s=>s.type==='expression'&&!s.unit&&!assistSlotNameKind(s)&&(get(node,s.path)?.kind==='StringLiteral'||get(node,s.path)?.kind==='NumberLiteral'&&['新しい中身','入れるもの','はじめの 中身','答え'].includes(s.label)));
  if(values.length&&stringSlots.length===1){put(node,stringSlots[0].path,{kind:'StringLiteral',value:values[0]});filled.add(stringSlots[0].path);}
  const remaining=data.numbers.filter((n,i)=>!used.has(i)&&!n.unit),numberSlots=slots.filter(s=>s.type==='expression'&&isNumber(get(node,s.path))&&!data.numbers.some(n=>n.unit&&n.unit===s.unit));
  if(remaining.length&&numberSlots.length===1){numberAt(numberSlots[0],remaining[0].value);filled.add(numberSlots[0].path);}
  // A part named fills a part's place before the part that does the sentence (ねこを子ねこのところへ移動させる goes to
  // 子ねこ, not to itself; 犬にねこのコピーを作らせる copies ねこ), when the sentence names another. The part that does
  // it is the part made to do it (ねこを…させる, 犬に…させる), or else the body's owner when no subject is written (a
  // subject written is not among the names read).
  const made=/(?:させ|せる|かす|かせ)(?:る)?$/.test(data.text)?project.components.map(c=>c.name).find(name=>['を','に'].some(p=>data.text.startsWith(name+p)||data.text.startsWith('「'+name+'」'+p))):null;
  const goer=made||(data.subject?null:project.components.find(c=>c.id===ctx.targetId)?.name);
  data={...data,names:[...data.names].sort((a,b)=>Number(a.name===goer)-Number(b.name===goer))};
  // (自分の and 作品の stay before a name written only when the part, or the work, has that name: 自分の体力を1ふやす
  // with 点数 of the work written is 点数を1ふやす)
  const owned=(old: Place,name: string)=>{const data=old.qualifier==='self'?project.components.find(c=>c.id===ctx.targetId)?.localData:old.qualifier==='project'?project.projectData:null;
    return ['self','project'].includes(String(old.qualifier))&&![...data?.variables||[],...data?.lists||[]].some(v=>v.name===name)?{qualifier:null}:{};};
  for(const s of slots){const kind=assistSlotNameKind(s);if(!kind)continue;const name=data.names.find(n=>n.kind===kind||kind==='variable'&&['list','argument','local'].includes(n.kind));if(!name)continue;const old=get(node,s.path);if(!old)continue;
    if(old.kind==='StringLiteral')put(node,s.path,{...old,value:name.name});else if(typeof old.name==='string')put(node,s.path,{...old,name:name.name,...owned(old,name.name)});filled.add(s.path);boundKinds.add(name.kind);
  }
  if(hint.binding){const name=data.names.find(n=>['variable','list','argument','local'].includes(n.kind));if(name){for(const s of slots){const old=get(node,s.path);if(old&&old.name===hint.binding.name){Object.assign(old,{name:name.name},owned(old,name.name));filled.add(s.path);boundKinds.add(name.kind);}}}}
  if(['Say','ReturnStatement','LooksCommand'].includes(node.kind)){const name=data.names.find(n=>['variable','argument','local'].includes(n.kind));if(name){const s=slots.find(s=>['value','args.1'].includes(s.path));if(s){try{put(node,s.path,parseExpression(nameSource(name.name),ctx.symbols,ctx));filled.add(s.path);boundKinds.add(name.kind);}catch{}}}}
  if(node.kind==='UserActionCall'){
    const args=project.actions.find(a=>a.name===node.name)?.args||[],namedArgs=args.map((name,index)=>({name,index,escaped:name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})).sort((a,b)=>b.name.length-a.name.length),assigned=new Set<number>(),prefixArg=(value: { at: number })=>namedArgs.find(({escaped})=>new RegExp('(?:^|[、はがをにへとので])'+escaped+'(?:を|は)$').test(data.text.slice(0,value.at))),suffixArg=(value: { end: number })=>namedArgs.find(({escaped})=>new RegExp('^(?:を)?'+escaped+'として').test(data.text.slice(value.end)));
    const nameValues=data.names.filter(n=>['variable','list','local','argument'].includes(n.kind)).flatMap(n=>{const escaped=n.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return [...data.text.matchAll(new RegExp('(?:^|(?<=[はがをにへとので、 【]))'+escaped+'(?=$|[はがをにへとので、 】])','g'))].map(m=>{const wrapped=data.text[m.index-1]==='【'&&data.text[m.index+m[0].length]==='】';return{name:n.name,wrapped,at:m.index-(wrapped?1:0),end:m.index+m[0].length+(wrapped?1:0),value:parseExpression(nameSource(n.name),ctx.symbols,ctx)};});}).filter(n=>!data.stringValues.some(s=>s.at<=n.at&&n.end<=s.end)&&!(args.includes(n.name)&&!n.wrapped&&!prefixArg(n)&&!suffixArg(n)&&/^(?:を|は|として)/.test(data.text.slice(n.end))));
    const values: { at: number; end: number; value: Expression; index?: number }[]=[...data.numbers.filter(n=>!n.unit).map(n=>({at:n.at,end:n.end,value:literal(n.value)})),...data.stringValues.map(s=>({...s,value:{kind:'StringLiteral' as const,value:s.value}})),...nameValues].sort((a,b)=>a.at-b.at);
    // (a call has its arguments; each value is given its index first)
    for(const value of values){value.index=(prefixArg(value)||suffixArg(value))?.index??-1;if(value.index>=0){node.args![value.index]=value.value;assigned.add(value.index);filled.add('args.'+value.index);}}
    for(const value of values.filter(v=>v.index!<0)){const index=node.args!.findIndex((_,i)=>!assigned.has(i));if(index<0)break;node.args![index]=value.value;assigned.add(index);filled.add('args.'+index);}
  }
  if(node.kind==='CloneCommand'&&['CREATE_SELF','CREATE_TARGET'].includes(node.op)){const n=data.numbers.find(n=>['count','つ'].includes(n.unit));if(n){node.count=literal(n.value);filled.add('count');}}
  if(['LocalVariableDeclaration','LocalListDeclaration'].includes(node.kind)){
    const name=/【([^【】]+)】/.exec(data.text)?.[1]||/^(.+?)という(?:変数|へんすう|リスト)/.exec(data.text)?.[1];if(name){node.name=name;filled.add('name');}
  }
  if(node.condition?.kind==='SensorRead'&&node.condition.sensor==='KEY_DOWN'&&data.keys.length){node.condition.arg={kind:'StringLiteral',value:data.keys[0]};filled.add('condition.arg');}
  if(node.condition){
    const conditions=[data.text.replace(/(?:、?くり返す|待つ|待って)$/,'').replace(/のを$/,'まで'),data.clauses[0]?.text.replace(/^もし/,'')];
    // (a clause not there throws and is passed over)
    conditionLoop:for(const condition of conditions)for(const form of ['if','while','until','plain'] as const)try{node.condition=parseCondition(condition as string,ctx.symbols,ctx,form);filled.add('condition');break conditionLoop;}catch{}
  }
  try{let text=formatScript(ast).trim();if(ctx.assistExistingBody&&['IfStatement','Forever','RepeatCount','RepeatWhile','RepeatUntil','ForEach'].includes(node.kind))text=text.split('\n')[0];return {...hint,text,filled:filled.size,defaultNumericSlots:slots.some(s=>s.type==='expression'&&isNumber(get(node,s.path))&&!filled.has(s.path)),conditionFilled:filled.has('condition')||filled.has('condition.arg'),boundKinds:[...boundKinds],valueChoices:stringSlots.length===1?values:[]};}catch{return null;}
}
function assistSearch(project: Project,basis: string,range: AssistRange,ctx: AssistContext,data: AssistData) {
  // How a hint was found by its best word: as it is ranked, with the intent it was found by.
  type Found = { schemaId: string; origin: string; layer: number; rank: number; fragment: boolean; order: number; intent: SearchIntent | null | undefined; exact: boolean; inText: boolean | undefined };
  const all=hintCandidates(project,ctx.targetId,{...ctx,source:basis,start:range.lineStart+range.indent,end:range.lineEnd}), candidates: AssistHint[]=all.filter(h=>h.mode==='statement'&&h.enabled);
  if(range.indent===0&&(/、$/.test(range.text)||/(?:たら|とき|ごと|たび)、?$/.test(range.text)))candidates.push(...assistHeadings(project,ctx,data));
  const ranked: AssistRow[]=[],fallbacks: AssistRow[]=[],matchedCache=new Map<string, boolean>(),match=(words: string,seed: string)=>{const key=words+'\0'+seed;if(!matchedCache.has(key))matchedCache.set(key,matchesSearch(words,seed));return matchedCache.get(key);};
  // (the pattern of the indent matches every line)
  const nextLine=basis.slice(range.lineEnd+1).split('\n')[0]||'',fillContext={...ctx,assistExistingBody:nextLine.trim()&&nextLine.match(/^\s*/)![0].length>range.indent};
  const spriteNames=new Set(project.components.filter(c=>c.type==='sprite').map(c=>c.name));
  const namedIntent=(seed: string): SearchIntent | null=>{
    if(data.names.some(n=>n.kind==='part'&&project.components.some(c=>c.name===n.name&&['label','button','box'].includes(c.type)))&&data.names.some(n=>['variable','list'].includes(n.kind))&&/^「[^「」]+」を.+にする$/.test(data.text))return {schemaId:'LooksCommand:SET_TARGET_TEXT'};
    if(data.names.some(n=>['action','function'].includes(n.kind))&&/行う|行って|呼び|させる|わた|として|てじゅん|手順/.test(data.text))return null;
    if(data.names.some(n=>['action','function'].includes(n.kind)&&new RegExp('^'+searchReading(n.name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:する|して|したい|させる)?$').test(searchReading(seed).replace(/[【】]/g,''))))return null;
    // A quoted text that is not a name in the work is what is said or written, not what is done (「右へ40歩」と言う), and
    // a sprite's name is never an action (回るねこを右へ10歩移動させる moves 回るねこ; the name of an input field or a
    // text part says what it is).
    let read=seed.replace(/「([^「」]*)」/g,(quote: string,value: string)=>!spriteNames.has(value)&&data.names.some(n=>n.name===value)?quote:'「□」');
    for(const name of [...spriteNames].sort(assistLongestFirst))read=read.split(name).join('「□」');
    let intent=searchIntent(read,ctx);
    if(/(?:にする|になる|かえる)$/.test(seed)){const image=data.names.find(n=>['costume','backdrop'].includes(n.kind));if(image)intent={schemaId:image.kind==='costume'?'LooksCommand:SET_COSTUME':'LooksCommand:SET_BACKDROP'};}
    if(data.strings.length&&/と(?:伝える|つたえる)$/.test(seed))intent={schemaId:'Broadcast'};
    if(data.strings.length&&/(?:と|って)(?:きく|聞く)$/.test(seed))intent={schemaId:'Ask'};
    const scalar=data.names.some(n=>['variable','argument','local'].includes(n.kind))||(project.projectData?.variables||[]).length===1&&/^.+?を\d+(?:あげる|上げる)$/.test(seed),list=data.names.some(n=>n.kind==='list');
    if(scalar&&/^LooksCommand:SET_SCALE$/.test(intent?.schemaId||''))intent=null;
    if(scalar&&/マイナス|へら|へる|減ら|減る|小さく/.test(seed))intent={schemaId:'NumericUpdate:SUB'};
    else if(scalar&&/ふや|増や|ふえる|増える|たす|足す|大きく|あげる|上げる|上がる|あがる/.test(seed))intent={schemaId:'NumericUpdate:ADD'};
    if(list&&!/番|ばんめ|つ目|つめ/.test(seed)&&/消す|けす|削除|クリア|からに|空に|(?:全部|ぜんぶ)すてる/.test(seed))intent={schemaId:'ListClear'};
    if(list&&/番|ばんめ|つ目|つめ/.test(seed)&&/消す|けす/.test(seed))intent={schemaId:'ListDelete'};
    if(list&&/の中に.*入れる$/.test(seed))intent={schemaId:'ListAppend'};
    if(list&&/中身.*(?:全部|ぜんぶ)?(?:言う|いう)$/.test(seed))intent={schemaId:'Say'};
    if(/(?:ふれる|おされる|おす)(?:のを|まで)(?:待つ|まつ|待って)$/.test(seed))intent={schemaId:'WaitUntil'};
    if(data.strings.length&&/と(?:小さな声で|大きな声で)?(?:言う|いう|話す)$/.test(seed))intent={schemaId:'Say'};
    if(data.strings.length&&/言って答えを待つ$/.test(seed))intent={schemaId:'Ask'};
    if(data.names.some(n=>n.kind==='sound')&&/聞かせる|きかせる/.test(seed))intent={schemaId:'SoundCommand:SAMPLE_WAIT'};
    if(data.names.some(n=>n.kind==='part'&&project.components.some(c=>c.name===n.name&&['label','button','box'].includes(c.type)))&&data.names.some(n=>['variable','list'].includes(n.kind))&&/^「[^「」]+」を.+にする$/.test(data.text))intent={schemaId:'LooksCommand:SET_TARGET_TEXT'};
    if(data.names.some(n=>n.kind==='sound')&&/止める|とめる|ストップ/.test(seed))intent=searchIntent('音を止める',ctx);
    if(intent?.schemaId==='LooksCommand:SET_COLOR'&&data.keys.some(key=>seed.includes(key)||seed.includes(keySurface(key))))return null;
    return intent;
  };
  const mainIntent=namedIntent(data.text)||data.seeds.filter(s=>!s.fragment).map(s=>namedIntent(s.text)).find(Boolean),seeds=data.seeds.map((seed,index)=>({...seed,intent:mainIntent?index===0?mainIntent:null:namedIntent(seed.text)}));
  const restrictMotion=mainIntent&&/^MotionCommand:/.test(mainIntent.schemaId)&&mainIntent.schemaId!=='MotionCommand:GOTO'&&mainIntent.direction!=='backward';
  const mainText=data.clauses.at(-1)?.text||data.text,tail=mainText.replace(/「[^「」]*」|【[^【】]*】/g,'').split(/[をにへとでがはの、\d歩秒度％]+/).filter(Boolean).at(-1)||'';
  const verbs=[...new Set([...searchQueryVariants(tail.replace(/^(?:何回も|何度も|なんかいも|なんども)/,'')),...seeds.filter(seed=>seed.fragment).map(seed=>seed.text)].filter(word=>word.length>=2&&/[うくぐすつぬぶむる]$/.test(word)&&!/^(?:する|なる|ある|いる|にする|になる)$/.test(word)))];
  const sourceWords=[...new Set(data.clauses.flatMap(clause=>clause.text.replace(/「[^「」]*」|【[^【】]*】/g,'').replace(/\d+(?:\.\d+)?(?:歩|秒|度|％|回|番目|Hz)?/g,'').split(/[をにへとでがはの、]/)).filter(Boolean))];
  for(let order=0;order<candidates.length;order++){
    const h=candidates[order],id=hintSchemaId(h.id).replace(/:timed$/,''),terms=h.terms||{text:[h.text.split('\n')[0]],synonyms:hintSearchSynonyms(h.id),verbForms:[],nounForms:[],intent:[],acceptedReadings:[]};let best: Found | null=null,exactSeen=false,matchLength=0;
    if(data.headerEvent&&id!=='Heading:'+data.headerEvent)continue;
    if(restrictMotion&&/^MotionCommand:/.test(id)&&id!==mainIntent.schemaId)continue;
    if(mainIntent?.schemaId==='MotionCommand:GOTO'&&['MotionCommand:MOVE','MotionCommand:MOVE_BY','ContinuousRule'].includes(id))continue;
    if(mainIntent?.schemaId==='ContinuousRule'&&/^MotionCommand:/.test(id))continue;
    if(mainIntent&&/^MotionCommand:/.test(mainIntent.schemaId)&&['UserActionCall','ForEach'].includes(id)&&!data.names.some(n=>n.kind==='action'))continue;
    if(/のところ(?:へ|に|まで)(?:走|はし|とぶ|動)/.test(data.text)&&/^MotionCommand:/.test(id)&&id!=='MotionCommand:GOTO_PART')continue;
    if(/背景|はいけい/.test(data.text)&&/もどす|戻す/.test(data.text)&&id==='LooksCommand:PREV_COSTUME')continue;
    if(/すがた|姿|コスチューム/.test(data.text)&&/もどす|戻す/.test(data.text)&&id==='LooksCommand:PREV_BACKDROP')continue;
    if(h.id.endsWith(':timed')&&!data.numbers.some(n=>n.unit==='秒'))continue;
    if(id==='Say'&&/秒.*(?:話す|はなす|言う|いう)/.test(h.text)&&!data.numbers.some(n=>n.unit==='秒'))continue;
    const strictIntent=['PenCommand:SET_COLOR','PenCommand:SET_SIZE','PenCommand:STAMP','PenCommand:DOWN','PenCommand:CLEAR','SoundCommand:SET_VOLUME','SoundCommand:PITCH_UP','SoundCommand:PITCH_DOWN','TimerReset','WaitTime','WaitUntil','LooksCommand:SET_TARGET_TEXT','LooksCommand:SET_INPUT','ListClear','ListAppend'];
    const intentAlternative=mainIntent?.schemaId==='PenCommand:SET_COLOR'&&id==='PenCommand:DOWN'&&/線.*かく/.test(data.text)||mainIntent?.schemaId==='SoundCommand:SET_VOLUME'&&id==='SoundCommand:STOP_ALL'&&/ミュート|みゅーと/.test(data.text)||mainIntent?.schemaId==='ListAppend'&&id==='ListInsert'&&/の中に.*入れる$/.test(data.text);
    if(mainIntent&&strictIntent.includes(mainIntent.schemaId)&&id!==mainIntent.schemaId&&!intentAlternative)continue;
    if(mainIntent?.schemaId==='LooksCommand:SET_SCALE'&&/大きさ|おおきさ|さいず/.test(data.text)&&id==='SoundCommand:SET_VOLUME')continue;
    if(mainIntent?.schemaId==='RepeatCount'&&id!=='RepeatCount')continue;
    if(ctx.definitionKind==='function'&&id==='ForEach'&&/順|一つずつ/.test(data.text)&&/言う|話す/.test(data.text))continue;
    if(id==='ContinuousRule'&&!/あいだ|間|おしっぱなし/.test(data.text))continue;
    if(mainIntent&&['NumericUpdate:ADD','NumericUpdate:SUB'].includes(mainIntent.schemaId)&&id!==mainIntent.schemaId&&!/ずつ|が.*あいだ|が.*まで/.test(data.text))continue;
    const dataKind=data.names.find(n=>['variable','list','argument','local'].includes(n.kind))?.kind;
    if(h.binding&&['scalar','list'].includes(h.binding.kind)&&dataKind&&(h.binding.kind==='list')!==(dataKind==='list'))continue;
    if(h.binding&&['scalar','list'].includes(h.binding.kind)&&!dataKind&&/^.+?を(?:\d+|[一二三四五六七八九十]|マイナス)/.test(data.text)&&((h.binding.kind==='list'?project.projectData?.lists:project.projectData?.variables)||[]).length!==1)continue;
    if(dataKind&&/^LooksCommand:SET_SCALE$/.test(id)&&mainIntent?.schemaId!=='LooksCommand:SET_SCALE')continue;
    if(id==='UserActionCall'&&!data.names.some(n=>n.kind==='action'))continue;
    const own=[...(terms.text||[]),...(terms.synonyms||[]),...(terms.verbForms||[]),...(terms.nounForms||[])],shortWords=[...own,...(terms.text||[]).flatMap(word=>word.replace(/\d+(?:\.\d+)?(?:つ|段階|秒|歩|回|番目|度|％)/g,'').split(/[をにへとでがはの、。\d]+/))];
    const keyHit=id==='Heading:keyDown'&&data.keys.some(key=>match(h.text,keySurface(key)));
    const verbHit=keyHit||verbs.some(verb=>match(own.join(' '),verb)||verb.endsWith('する')&&verb.length>2&&match(own.join(' '),verb.slice(0,-2)))||own.some(word=>word.length>=2&&/[うくぐすつぬぶむる]$/.test(word)&&data.seeds.some(seed=>!seed.fragment&&searchReading(seed.text).endsWith(searchReading(word))))||(terms.synonyms||[]).some(word=>searchReading(data.text)===searchReading(word)||searchReading(data.text)==='げーむ'+searchReading(word));
    for(const seed of seeds){
      const intent=seed.intent;
      if(intent&&intent.schemaId!==id&&!intentAlternative&&!(h.binding&&match(h.binding.name,seed.text)))continue;
      let layer=6,found=false;
      const unitOnly=/^-?\d+(?:\.\d+)?(歩|秒|度|％|回|番目|Hz|つ|段階)$/.exec(seed.text);
      if(unitOnly){
        // (a block's schema has no op, so a form of an op is found by the id)
        const schema=BLOCK_SCHEMA_BY_ID.get(id),slots=SENTENCE_FORMS.filter(f=>f.kind===schema?.kind&&(!f.op||f.op===(schema as BlockSchema & { op?: undefined } | undefined)?.op||id===f.kind+':'+f.op)).flatMap(f=>f.roleSlots);
        if(!slots.some(slot=>slot.unit===unitOnly[1]))continue;found=true;layer=5;
      }else if(intent?.schemaId===id||intentAlternative&&seed===seeds[0]){found=true;layer=intentAlternative?5:4;}
      else if(data.headerEvent&&id==='Heading:'+data.headerEvent&&seed===seeds[0]){found=true;layer=5;}
      else for(const word of ([...seed.text].length<=2?shortWords:own)){const short=[...seed.text].length<=2, phrase=(terms.synonyms||[]).includes(word)&&word.search(/[をにへとでがはの]/)>0;
        const hit=short?searchReading(word)===searchReading(seed.text):phrase?match(seed.text,word):match(word,seed.text);
        if(hit){found=true;layer=5;break;}
      }
      if(!found&&[...seed.text].length>2&&match([...(terms.intent||[]),...(terms.acceptedReadings||[])].join(' '),seed.text))found=true;
      if(!found)continue;
      const nounException=data.headerEvent&&id==='Heading:'+data.headerEvent||id==='MotionCommand:BOUNCE'&&searchReading(h.text).startsWith(searchReading(data.clauses[0].text+'、'))||id==='MotionCommand:MOVE'&&/^前に来る$/.test(data.text)||id==='MotionCommand:GOTO_PART'&&/のところ(?:へ|に|まで)(?:走|はし|とぶ|動)/.test(data.text)||['LooksCommand:FRONT','LooksCommand:FORWARD_LAYERS'].includes(id)&&/手前|てまえ/.test(data.text)||['LooksCommand:BACK','LooksCommand:BACKWARD_LAYERS'].includes(id)&&/おく|奥|後ろに下がる/.test(data.text)||['Broadcast','BroadcastAndWait'].includes(id)&&/(?:合図|メッセージ).*出す/.test(data.text);
      if(layer===5&&verbs.length&&!verbHit&&!nounException&&!intentAlternative)layer=6;
      const exact=own.some(w=>searchReading(w)===searchReading(seed.text));exactSeen||=exact;matchLength=Math.max(matchLength,seed.text.length);
      const row={schemaId:id,origin:'S3',layer,rank:seed.rank,fragment:seed.fragment,order,intent:layer===4?intent:null,exact:own.some(w=>searchReading(w)===searchReading(seed.text)),inText:verbs.length?verbs.some(verb=>searchReading(terms.text.join(' ')).includes(searchReading(verb))):match(terms.text.join(' '),seed.text)};
      if(!best||row.layer<best.layer||row.layer===best.layer&&(row.rank<best.rank||row.rank===best.rank&&Number(row.fragment)<Number(best.fragment)))best=row;
    }
    if(best){const filled=assistFillHint(h,data,project,fillContext,best.intent||(id==='MotionCommand:MOVE_BY'&&searchReading(data.text)==='はねる'?{schemaId:id,direction:'up'}:null));if(filled){
        const words=sourceWords.filter(word=>match(own.join(' '),word));
        const named=id==='UserActionCall'&&data.names.some(n=>n.kind==='action'&&h.text.includes(n.name))||id==='MotionCommand:GOTO_PART'&&/のところ(?:へ|に|まで)(?:走|はし|とぶ|動)/.test(data.text);
        const row={...filled,...best,named,exact:exactSeen,wordCount:words.length,matchLength:words.length?Math.max(...words.map(word=>word.length)):matchLength};if(['IfStatement','RepeatWhile','RepeatUntil','WaitUntil'].includes(id)&&!filled.conditionFilled)row.layer=6;if(named){row.layer=Math.min(row.layer,5);row.rank=0;row.fragment=false;}ranked.push(row);
        if(best.layer===6&&filled.boundKinds?.length)fallbacks.push({...row,layer:5,rank:10,fragment:true,wordCount:0});
        // (a hint with no choices has no more than one)
        if(filled.valueChoices?.length!>1)for(const [i,value]of filled.valueChoices!.slice(1).entries()){const alternative=assistFillHint(h,{...data,strings:[value]},project,fillContext,best.intent);if(alternative)ranked.push({...row,...alternative,order:order+(i+1)/100});}
      }
      if(best.intent?.directions)for(const direction of best.intent.directions.slice(1)){const alt=assistFillHint(h,data,project,fillContext,{...best.intent,direction});if(alt)ranked.push({...alt,...best,order:order+0.1});}
    }else if(data.names.length){
      const schema=BLOCK_SCHEMA_BY_ID.get(id),slots=schema?sentenceRoleSlots(schema.kind,id.split(':')[1]):[];
      const nameSlot=slots.some(slot=>data.names.some(n=>n.kind===assistSlotNameKind(slot)))||['Say','ReturnStatement','LooksCommand:SET_TARGET_TEXT'].includes(id)&&data.names.some(n=>['variable','list','local','argument'].includes(n.kind));
      if(nameSlot){const filled=assistFillHint(h,data,project,fillContext);if(filled?.boundKinds?.length)fallbacks.push({...filled,schemaId:id,origin:'S3',layer:5,rank:10,fragment:true,order:candidates.length+order,exact:false,inText:false,wordCount:0,matchLength:0});}
    }
  }
  const covered=new Set(ranked.filter(r=>r.layer<6).flatMap(r=>r.boundKinds||[]));
  const anyVerb=verbs.some(verb=>all.some(h=>{const t=h.terms;return t&&match([...(t.text||[]),...(t.synonyms||[]),...(t.verbForms||[]),...(t.nounForms||[])].join(' '),verb);}));
  // (a fallback is kept for the names it puts in)
  ranked.push(...fallbacks.filter(r=>!anyVerb&&r.boundKinds!.some(kind=>!covered.has(kind))));
  const noImageName=!data.names.some(n=>['costume','backdrop'].includes(n.kind));
  for(const row of ranked){row.special=0;
    if(noImageName&&/かえ|変え|にする/.test(data.text)&&/^LooksCommand:(?:SET|NEXT|PREV)_(?:COSTUME|BACKDROP)$/.test(row.schemaId))row.special=row.schemaId.includes(':NEXT_')?-2:row.schemaId.includes(':SET_')?-1:0;
    if(/もどす|戻す/.test(data.text)&&(/はいけい|背景/.test(data.text)&&row.schemaId==='LooksCommand:PREV_BACKDROP'||/すがた|姿/.test(data.text)&&row.schemaId==='LooksCommand:PREV_COSTUME'||/タイマー|たいまー/.test(data.text)&&row.schemaId==='TimerReset'))row.special=-3;
    const otherStop=data.names.some(n=>n.kind==='part'&&project.components.some(c=>c.name===n.name&&c.id!==ctx.targetId))&&/止まる|止める|とまる|とめる/.test(data.text);
    if(otherStop&&row.schemaId==='StopCommand:OTHERS'||/ほかの動き|他の動き/.test(data.text)&&row.schemaId==='StopCommand:OWN_OTHERS')row.special=-4;
    if(row.schemaId==='Break'&&data.seeds.some(seed=>/^(?:やめる|おわる|終わる|終える|おえる|ぬける|抜ける)$/.test(seed.text)))row.special=-4;
    if(ctx.event==='cloneStart'&&row.schemaId==='CloneCommand:DELETE_SELF'&&/^自分だけ.*消える$/.test(data.text))row.special=-4;
  }
  const eligibleSchemas=new Set(candidates.map(h=>hintSchemaId(h.id).replace(/:timed$/,'')));
  for(const row of ranked)row.allowedSchemas=eligibleSchemas;
  return ranked.filter(row=>!anyVerb||row.layer<6);
}
function assistClauseForms(text: string) {
  const quoted: string[]=[],protectedText=text.replace(/「[^「」]*」|【[^【】]*】|『[^『』]*』|｢[^｢｣]*｣|"[^"]*"/g,s=>'「§'+(quoted.push(s)-1)+'§」');
  const out=new Set([text,...searchQueryVariants(protectedText).map(form=>form.replace(/「§(\d+)§」/g,(_: string,i: `${number}`)=>quoted[i]))]);
  for(const [te,word]of SENTENCE_TE_FORMS)if(text.endsWith(te))out.add(text.slice(0,-te.length)+word);
  return [...out];
}
function assistCompare(a: AssistRanked,b: AssistRanked,ctx: AssistContext) {
  const sharedImage=/^LooksCommand:(?:SET|NEXT|PREV)_(?:COSTUME|BACKDROP)$/;
  const group=sharedImage.test(a.schemaId)&&sharedImage.test(b.schemaId)&&a.schemaId.split('_').at(-1)===b.schemaId.split('_').at(-1);
  return a.layer-b.layer||Number(!!b.named)-Number(!!a.named)||(a.special===-4?-1:0)-(b.special===-4?-1:0)||a.rank-b.rank||Number(a.fragment)-Number(b.fragment)||(group?(a.special||0)-(b.special||0):0)||(b.wordCount||0)-(a.wordCount||0)||Number(b.exact)-Number(a.exact)||(b.matchLength||0)-(a.matchLength||0)||b.filled-a.filled||Number(b.inText)-Number(a.inText)||(a.special||0)-(b.special||0)||(ctx.level==='basic'?(Number(BASIC_BLOCK_SCHEMA_IDS.has(b.schemaId))-Number(BASIC_BLOCK_SCHEMA_IDS.has(a.schemaId))):0)||a.order-b.order||a.text.length-b.text.length||a.schemaId.localeCompare(b.schemaId);
}
// The meaning a written sentence gives, as one frame for each thing it does, in order (LANGUAGE.md 読めない文の近い
// 書き方): who does it, what it does, to what, which way, how much, and what each time is. 2秒かけて／2秒で is the time
// the action takes; 2秒後に／2秒たってから／2秒待ってから is a wait before it (a frame of its own); a time with no such
// word may be either. A quoted text is a value, never an action (「2秒で右へ40歩」と言わせる speaks it). A sentence
// with a condition, a loop, a heading, a signal, a question or a procedure has no frames (null): they say nothing of it.
// The ends of a clause listed here (after たい, ます, ください…, with the quoted texts and the names in the work hidden)
// state an action in words; a kana word that may be two verbs (いって: 言って or 行って, きく: 聞く or 大きく, はなす: 話す
// or 離す, まって: 待って or 止まって) states none.
// A clause that ends in a number, a place or a particle (右へ100歩、2秒かけて、いまのばしょから、) belongs to the next one.
const ASSIST_ACTION_ENDS: readonly (readonly [string, RegExp])[]=[['say',/(?:言|話)(?:う|って|わせる|わせて|わせ|い|す|して|させる|させて|させ|し)$|いう$|いわせ(?:る|て)?$|しゃべ|叫|つぶや/],
  ['clone',/(?:コピー|クローン|複製|ふくせい|分身)を?(?:\d+(?:つ|こ|個|体|匹)、?)?(?:作|つく)(?:る|って|らせる|らせて|らせ|り)$|(?:コピー|クローン|複製|ふくせい)(?:する|して|させる|させて)$/],
  ['wait',/待(?:つ|って|ち)$|まつ$/],['turn',/(?:回|まわ)(?:る|って|す|して|らせる|らせて|り)$|回転(?:する|して|させる|させて)$/],
  ['move',/(?:動|うご)(?:く|いて|き|かす|かして|かせる|かせて)$|(?:進|すす)(?:む|んで|み|ませる|ませて|める|めて)$|(?:移動|いどう)(?:する|して|させる|させて|させ|し)$|行(?:く|って|き|かせる|かせて)$|(?:走|はし)(?:る|って|り|らせる|らせて)$|ジャンプ(?:する|して|させる|させて)$/]];
const assistActionOf=(id: string | null | undefined): string | null=>!id?null:/^MotionCommand:(?:TURN|SET_DIRECTION|POINT_TO)/.test(id)?'turn':/^MotionCommand:/.test(id)?'move':/^CloneCommand:/.test(id)?'clone':({Say:'say',Think:'say',Ask:'ask',WaitTime:'wait',WaitUntil:'wait'} as Partial<Record<string, string>>)[id]||'other:'+id.split(':')[0];
const ASSIST_DIRECTIONS={右:'right',左:'left',上:'up',下:'down',前:'forward',後ろ:'backward',うしろ:'backward'};
// The commands to the whole work have no part that does them (LANGUAGE.md 名人の本文の決まり 1); only these sentences
// go a way (a place to go to, or a direction to face, is not a way).
const ASSIST_WHOLE_WORK=/^(?:SoundCommand:STOP_ALL|LooksCommand:(?:SET|NEXT|PREV)_BACKDROP|PenCommand:CLEAR|StopCommand:(?:THIS|OTHERS|ALL))$/,ASSIST_WAYS=/^MotionCommand:(?:MOVE|MOVE_BY|TURN_RIGHT|TURN_LEFT)$/;
// A clause with two of these is two actions written without a break (10歩進む1秒待つ, 10歩進んだあと1秒待つ): its frame is
// not known.
const ASSIST_VERB_STEMS=/動(?!き[をがはのに])|進|移動|走|待|回|言|話/g;
// Names read longest first, so that a name inside another (ねこ in 子ねこ, in 回るねこ) is not read in it.
const assistLongestFirst=(a: string,b: string)=>b.length-a.length;
// Verbs that move, turn, hide, show or change the part written with を (ねこを回す, 進める, 移す, 向ける, かくす, 見せる,
// ねこを2倍の大きさにする, 大きくする): that part does it, as with させる.
const ASSIST_PART_VERBS=/(?:回|まわ)(?:す|して)|(?:進|すす)(?:める|めて)|(?:移|うつ)(?:す|して)|(?:向|む)(?:ける|けて)|(?:隠|かく)(?:す|して)|(?:見|み)(?:せる|せて)|(?:に|く)(?:する|して)/;
// (all of a list said is each of its items said, and nothing else: 持ち物の中身を全部言う)
const assistListAllSaid=(data: AssistData)=>data.names.some(n=>n.kind==='list')&&/全部(?:言う|話す)$/.test(data.text);
function assistMeaningFrames(data: AssistData,project: Project,ctx: AssistContext,source: unknown): AssistWant[] | null {
  const owner=project.components.find(c=>c.id===ctx.targetId)?.name||null,parts=project.components.map(c=>c.name).sort(assistLongestFirst);
  const text=data.text;if(data.subjects||/もし|なら|たら|れば|とき|時(?=[、。]|$)|場合|ばあい|だと|あいだ|まで|ずっと|続け|つづけ|くり返|繰り返|くりかえ|ごとに|たびに|おきに|毎秒|\d+回|何回|次の回|この回|ずつ|一つずつ|ひとつずつ|順に|順番|じゅんに|じゅんばん|同時|速さ|はやさ|スピード|手順|てじゅん|という|合図|メッセージ|知らせ|として|ながら|うちに|答え|こたえ|返事/.test(text.replace(/「[^「」]*」|『[^『』]*』/g,''))||data.names.some(n=>['action','function'].includes(n.kind)))return null;
  if(assistListAllSaid(data))return null;
  // The names in the work are names, never the words of an action (a procedure ジャンプ, a sound 歩く音).
  const words=[...new Set([...parts,...data.names.map(n=>n.name)])].sort(assistLongestFirst),escape=(n: string)=>n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  // ねこは…／ねこが…／ねこを…させる: the subject written, carried on until another is written. ねこの向きを… says whose
  // it is, which is the part that does it, though not written as a subject.
  const names=parts.map(escape).join('|'),causer=names&&/(?:させ|せる|かす|かせ)(?:る)?$/.test(text)?new RegExp('^(?:「)?('+names+')(?:」)?(?:を|に)').exec(text):null;
  let subject=data.subject?(['自分','体'].includes(data.subject)?owner:data.subject):causer?.[1]||null,written=!!causer||!!data.subject&&!new RegExp('^(?:「)?'+escape(data.subject)+'(?:」)?の').test(String(source).trim());
  const frames: AssistWant[]=[];let pending='';
  for(const [index,clause]of data.clauses.entries()){
    // Each quoted text, and whether it names the part written to (「犬」のところへ, 「犬」に).
    const raw=pending+assistNumberText(clause.text),quotes=[...raw.matchAll(/「([^「」]*)」(の|へ|に|を|まで)?|『([^『』]*)』/g)].map(m=>({value:m[1]??m[3],toward:!!m[2]}));
    const outside=raw.replace(/「[^「」]*」|『[^『』]*』/g,quote=>'§'.repeat(quote.length));
    let masked=outside;for(const name of words)masked=masked.split(name).join('□'.repeat(name.length));
    const end=masked.replace(/(?:たい|ます|ました|なさい|ください|てね|ね|よ|ほしい|ちゃう|ちゃって|[！!。])+$/,''),ending=ASSIST_ACTION_ENDS.find(([,pattern])=>pattern.test(end))?.[0]||null;
    if((masked.match(ASSIST_VERB_STEMS)||[]).length>1)return null;
    if(!ending&&index<data.clauses.length-1&&(/(?:かけて|かけ|から|まで|歩|秒|度|％|\d)$/.test(end)||/[^ぁ-ん](?:で|に|へ|を|と|は|が|も)$/.test(end)||!/[ぁ-ん]$/.test(end))){pending=raw+'、';continue;}
    pending='';
    // The part made to do the clause (ねこを…させて, ねこを回して) does only that clause; parts written together with を
    // (ねこと犬を…させる) are no one part, so no sentence of one subject keeps them.
    const made=names&&(new RegExp('((?:「?(?:'+names+')」?(?:と|、))+「?(?:'+names+')」?)(?:を|に)(?=.*(?:させ|せる|せて|かす|かして|かせ|'+ASSIST_PART_VERBS.source+'))').exec(outside)||new RegExp('('+names+')(?:を|に)(?=.*(?:させ|せる|せて|かす|かして|かせ))').exec(outside)||new RegExp('('+names+')を(?=.*(?:'+ASSIST_PART_VERBS.source+'))').exec(outside));
    const named=new RegExp('^(?:「)?('+[names,'自分'].filter(Boolean).join('|')+')(?:」)?(?:は|が|も)、?').exec(outside)||made,carried=[subject,written] as const;
    if(named){subject=named[1]==='自分'?owner:named[1].replace(/[「」]/g,'');written=true;}
    const read=raw.replace(/「([^「」]*)」|『([^『』]*)』/g,(quote: string,a: string | undefined,b: string | undefined)=>words.includes(a??b)?quote:'「□」');
    // A say, a copy or a wait is what its end says; any other action is the work's reading of the words (最前面へ移動する
    // brings the part to the front), or else its end. Only an action its end says (stated) is one a candidate must do:
    // 前に出る may be a move or coming to the front. A way is a word of direction with へ／に after it (not 最前面).
    const told=['say','clone','wait'].includes(ending),intent=told?null:searchIntent(read,ctx)||searchIntent(read.replace(/([えけげせぜてでねべめれいきしちにびみり])[たて]$/,'$1る'),ctx),action=told?ending:assistActionOf(intent?.schemaId)||ending;
    const way=/(?<![一-龯ァ-ヶ])(右|左|上|下|前|後ろ|うしろ)(?:へ|に|の方|方向|むき|向き|側|がわ)/.exec(masked.replace(/画面の|がめんの/g,''));
    // 犬に「やあ」と言う tells 犬: a signal to it keeps that meaning as well as the words said.
    // (the pattern of a way takes only the words of the table)
    const frame: AssistWant={action,stated:!!ending,subject,written,directions:['move','turn',null].includes(action)?intent?.directions||(intent?.direction?[intent.direction]:way?[ASSIST_DIRECTIONS[way[1] as keyof typeof ASSIST_DIRECTIONS]]:[]):[],quantities:[],strings:quotes.filter(q=>!(q.toward&&parts.includes(q.value))).map(q=>q.value),names:quotes.map(q=>q.value).filter(v=>words.includes(v)||data.keys.includes(keyWord(v))),raw,copy:/(?:コピー|こぴー|クローン|くろーん|複製|ふくせい|分身|ぶんしん|ふや|増や)/.test(masked),quoted:/[「」『』（）()【】［］〈〉《》｢｣"]/.test(raw),objects:[],tell:action==='say'&&!!names&&new RegExp('(?:'+names+'|「(?:'+names+')」)に').test(raw.replace(/「([^「」]*)」(?!に)/g,quote=>'§'.repeat(quote.length)))},before: AssistWant[]=[];
    for(const m of outside.matchAll(/(-?\d+(?:\.\d+)?)(歩|ほ|ぽ|度|ど|秒|びょう|％|%|倍|ばい)(半|はん)?/g)){
      const unit=({ほ:'歩',ぽ:'歩',ど:'度',びょう:'秒','%':'％',ばい:'倍'} as Partial<Record<string, string>>)[m[2]]||m[2],value=Number(m[1])+(m[3]&&unit==='秒'?0.5:0),after=outside.slice(m.index+m[0].length);
      // N倍 is N×100％ (2倍にする is 大きさを200％にする).
      if(unit==='倍'){frame.quantities.push({unit:'％',value:value*100,role:'％'});continue;}
      if(unit!=='秒'){frame.quantities.push({unit,value,role:unit});continue;}
      if(action==='wait')frame.quantities.push({unit,value,role:'wait'});
      else if(/^(?:後|ご|あと|たって|経って|たった|待って|まって|待ち)/.test(after))before.push({action:'wait',subject,written,directions:[],quantities:[{unit,value,role:'wait'}],strings:[],objects:[]});
      else frame.quantities.push({unit,value,role:/^(?:間)?(?:かけて|かけ|で(?![はもき])|ほどで|くらいで|ぐらいで)/.test(after)?'during':'unknown'});
    }
    // The longest names are read first: ねこ inside 子ねこ is not another part. Parts written together as the subject
    // (ねこと犬は) are read before the meaning is (assistListedSubjects).
    let rest=outside;
    for(const name of parts)if(rest.includes(name)){if(name!==subject)frame.objects.push(name);rest=rest.split(name).join('□'.repeat(name.length));}
    // 自分 written as what is acted on (自分のコピー) is the part that does it.
    if(/自分(?![はがも])/.test(rest))frame.objects.push(subject||owner);
    for(const q of quotes)if(q.toward&&parts.includes(q.value)&&q.value!==subject)frame.objects.push(q.value);
    // A clause whose time is the wait before it and that says nothing else (2秒たって、) is that wait only.
    frames.push(...before,...(before.length&&!frame.action&&![frame.directions,frame.quantities,frame.strings,frame.objects].some(r=>r.length)?[]:[frame]));
    if(named&&named===made)[subject,written]=[carried[0]??owner,carried[1]];
  }
  return frames.some(f=>f.action||f.directions.length||f.quantities.length||f.strings.length||f.objects.length||f.subject&&f.subject!==owner)?frames:null;
}
// The frames of a candidate, read from its syntax: one for each sentence, or null for a sentence with a body (もし,
// くり返し) or a heading, which a frame cannot say.
function assistAstFrames(ast: Script | null | undefined,project: Project,ctx: AssistContext): AssistGot[] | null {
  if(!ast||ast.heading||ast.rules?.length)return null;
  const owner=project.components.find(c=>c.id===ctx.targetId)?.name||null,parts=project.components.map(c=>c.name),frames: AssistGot[]=[];
  const number=(v: Expression | null | undefined)=>v?.kind==='QuantityLiteral'&&v.value?.kind==='NumberLiteral'?{unit:v.unit,value:v.value.value}:null;
  for(const n of ast.body||[]){
    if(n.kind==='CommentLine')continue;if(n.body||n.thenBody||n.lanes)return null;
    const id=n.op?n.kind+':'+n.op:n.kind,action=assistActionOf(id);
    const subject=n.actorRef?.kind==='named'?n.actorRef.name:n.actorRef?.kind==='all'?null:owner,strings: string[]=[],said: string[]=[],objects: (string | null)[]=[],quantities: AssistQuantity[]=[];
    const direction=n.op==='MOVE_BY'?(n.x?n.xDir:n.y?n.yDir:null):n.op==='MOVE'?n.direction:n.op==='TURN_RIGHT'?'right':n.op==='TURN_LEFT'?'left':null;
    // (a number found is read again; a sentence's arguments are values: a definition's names are in no body)
    for(const key of ['x','y','seconds'] as const)if(number(n[key]))quantities.push({...number(n[key])!,role:key==='seconds'?(n.kind==='WaitTime'?'wait':'during'):number(n[key])!.unit});
    for(const arg of n.args as Expression[] | undefined||[]){const q=number(arg);if(q)quantities.push({...q,role:q.unit});else if(arg?.kind==='StringLiteral')(parts.includes(arg.value)?objects:strings).push(arg.value);}
    // What is said, asked or sent as a signal is a text, even when it is a part's name.
    for(const key of ['value','message','question'] as const)if(n[key]?.kind==='StringLiteral'){strings.push(n[key].value);said.push(n[key].value);}
    if(n.kind==='CloneCommand'&&n.op==='CREATE_SELF')objects.push(subject);
    frames.push({action,subject,direction,ways:ASSIST_WAYS.test(id),whole:ASSIST_WHOLE_WORK.test(id),creates:n.kind==='CloneCommand'&&/^CREATE/.test(n.op),quantities,strings,said,objects,explicit:n.actorRef?.kind==='named'});
  }return frames;
}
// How a candidate keeps the frames written: null when it says something else (another subject, way, number, text or
// part, a text not written, a time of another kind, a time added to an action, or a sentence more or fewer), else the
// number of roles it leaves out or does otherwise (missing: a way, a number, a text, a part, another action) and
// whether it names each subject written as it was written (explicit). A time that may be either kind (a move or a
// turn) is kept as the time of the action or as a wait just before it. One frame with no action known (ねこの動きを
// 止める) says only its roles, which hold for every sentence of the candidate. A sentence that does another action than
// the one written and keeps none of the way, the numbers, the texts and the parts written is not near at all (a copy of
// ねこ for ねこを右へ40歩移動させる, 点数を1へらす for 子ねこを「犬」の方へ回らせる), nor is a part going to or facing
// itself.
function assistMeaningPair(w: AssistWant,g: AssistGot): AssistMeaning | null {
  if(['move','turn'].includes(g.action)&&g.objects.includes(g.subject))return null;
  // A copy is made only when a copy is written (コピー, 複製, ふやす…): not for ねこを2倍の大きさにする.
  if(g.creates&&w.copy===false)return null;
  let missing=0,explicit=true,kept=0,named=0;
  const differs=w.action&&g.action!==w.action&&!(w.tell&&/^other:Broadcast/.test(g.action)),other=w.stated&&differs;if(other)missing++;
  if(!g.whole&&w.action!=='wait'&&w.subject){if(g.subject!==w.subject)return null;if(w.written&&!g.explicit)explicit=false;}
  if(w.directions.length&&g.ways){if(!g.direction)missing++;else if(!w.directions.includes(g.direction))return null;else kept++;}
  for(const q of w.quantities){if(q.kept){kept++;continue;}const same=g.quantities.filter(x=>x.unit===q.unit&&(q.role==='unknown'||x.role===q.role));
    if(same.length&&!same.some(x=>x.value===q.value))return null;if(!same.length&&g.quantities.some(x=>x.unit===q.unit))return null;if(!same.length)missing++;else kept++;}
  if(w.action&&w.action!=='wait'&&g.quantities.some(x=>x.unit==='秒'&&!w.quantities.some(q=>q.unit==='秒')))return null;
  // A number of a unit written is not joined by another of that unit (10歩うしろへ is not 右へ10歩、上へ50歩).
  if(g.quantities.some(x=>x.unit!=='秒'&&w.quantities.some(q=>q.unit===x.unit)&&!w.quantities.some(q=>q.unit===x.unit&&q.value===x.value)))return null;
  // Nor is a number written turned into a number of another unit (右へ40歩回る is not 右に15度回る, 2倍の大きさ is not
  // 120％), but by facing (画面の右を向く faces 0度). A text not written is not added, and with nothing quoted nothing is said,
  // asked or sent (an empty text is 空 written; a name in the work, as 「ベル」 for 音を出す, may fill a place).
  if(!(g.action==='turn'&&!g.ways)&&w.quantities.some(q=>q.unit!=='秒')&&g.quantities.some(x=>x.unit!=='秒'&&!w.quantities.some(q=>q.unit===x.unit)))return null;
  if(w.strings.length&&g.strings.some(v=>!w.strings.includes(v))||!w.quoted&&g.said.some(v=>v!==''&&!(w.raw||'').includes(v)))return null;missing+=w.strings.filter(v=>!g.strings.includes(v)).length;for(const v of w.strings)if(g.strings.includes(v)){kept++;if(w.names?.includes(v))named++;}
  if(w.objects.length&&g.objects.length&&!w.objects.some(o=>g.objects.includes(o)))return null;if(w.objects.length&&!g.objects.length)missing++;else if(w.objects.length){kept++;named++;}
  // A sentence that does another action than the one read and keeps only names in the work written (a part, a costume,
  // a sound) is not near (ねこを2倍の大きさにする is not 「ねこ」のところへ行く, すがたを「丸」にかえた is not 点数を「丸」にする).
  return other&&!kept||differs&&named&&kept===named?null:{missing,explicit,nameOnly:named>0&&kept===named};
}
function assistMeaningMatch(want: AssistWant[] | null,got: AssistGot[] | null): AssistMeaning | null {
  if(!want||!got)return want&&!got?null:{missing:0,explicit:true};
  // (every(Boolean) holds: each pair is there)
  if(want.length===1&&!want[0].action){const pairs=got.map(g=>assistMeaningPair(want[0],g));return pairs.length&&pairs.every(Boolean)?{missing:Math.min(...pairs.map(p=>p!.missing)),explicit:pairs.every(p=>p!.explicit),nameOnly:pairs.every(p=>p!.nameOnly),actions:[...new Set(got.map(g=>g.action))].sort().join()}:null;}
  let missing=0,explicit=true,j=0;
  for(const w of want){let g=got[j++];if(!g)return null;
    const either=['move','turn'].includes(w.action)&&w.quantities.find(q=>q.unit==='秒'&&q.role==='unknown');let frame=w;
    if(either&&g.action==='wait'&&got[j]&&got[j].action!=='wait'){if(g.quantities.find(x=>x.unit==='秒')?.value!==either.value)return null;g=got[j++];frame={...w,quantities:w.quantities.map(q=>q===either?{...q,kept:true}:q)};}
    const pair=assistMeaningPair(frame,g);if(!pair)return null;missing+=pair.missing;explicit&&=pair.explicit;
  }return j===got.length?{missing,explicit}:null;
}
// The words that name the sound, the pen and a move (音, ペン, 歩 or a way). After the nearest sentence, a sentence of
// another of these kinds is near only when the writing names it, and one that changes a variable or a list only when
// its name is written (犬のペンを上げる: not 点数を1ふやす, nor 音の高さを1段階上げる; 音楽をかける is no move). The
// nearest sentence stands as the search found it (犬を追いかける is 「犬」のところへ行く).
const ASSIST_FAMILY_WORDS={SoundCommand:/音|鳴|なら|曲|メロディ|Hz|ヘルツ|歌|うた/,PenCommand:/ペン|ぺん|えんぴつ|鉛筆|クレヨン|マーカー|筆|ふで|線|かく(?!す|し|れ)|描|書|スタンプ|はんこ|ハンコ/,
  MotionCommand:/歩|\d+(?:ほ|ぽ)|進|すす|動|うご|行|い[くっき]|移動|いどう|走|はし|右|左|上|下|前|後|うしろ|向|む[くけ]|回|まわ|ところ|ばしょ|場所|位置|ジャンプ|跳|はね|戻|もど|方|よこ|たて|座標|飛|と[ぶん]/};
// Words that ask for something to be said, asked or sent; a text not written is then a placeholder to fill in.
const ASSIST_SAY_WORDS=/言|いう|いって|いった|いわ|話|はな[さしすせそ]|たず|尋|聞|きい|きく|質問|問|合図|あいず|送|おく[らりるれろっ]|知らせ|しらせ|メッセージ|叫|さけ|つぶや|呼|答|こた|返事|へんじ|セリフ|せりふ|ふきだし|吹き出し/;
const ASSIST_DATA_KINDS=['Assignment','NumericUpdate','ListAppend','ListInsert','ListReplace','ListDelete','ListClear'];
// Every node of a syntax tree, in the order written (the sentences, the sentences in them and their values).
function assistNodes(tree: unknown) {
  const nodes: AssistNode[]=[],visit=(n: unknown)=>{if(Array.isArray(n)){n.forEach(visit);return;}if(!n||typeof n!=='object')return;if((n as AssistNode).kind)nodes.push(n as AssistNode);for(const [k,v]of Object.entries(n))if(k!=='sourceSpan')visit(v);};
  visit(tree);return nodes;
}
const assistKinds=(ast: Script)=>new Set(assistNodes(ast.body).map(n=>n.kind));
const assistKindsOps=(ast: Script)=>assistNodes(ast.body).map(n=>n.kind+':'+n.op);
function assistFamiliesWritten(ast: Script,data: AssistData,nearest: Set<string>,dataOnly=false) {
  // (a kind with no words of its own: undefined)
  const sounds=data.names.filter(n=>n.kind==='sound').map(n=>n.name),text=data.text.replace(/「[^「」]*」|『[^『』]*』/g,'');
  return assistNodes(ast.body).every(n=>nearest.has(n.kind)||
    (dataOnly||!(ASSIST_FAMILY_WORDS[n.kind as keyof typeof ASSIST_FAMILY_WORDS] as RegExp | undefined)||ASSIST_FAMILY_WORDS[n.kind as keyof typeof ASSIST_FAMILY_WORDS].test(text)||n.kind==='SoundCommand'&&sounds.some(name=>data.text.includes(name)))&&
    !(ASSIST_DATA_KINDS.includes(n.kind)&&n.target?.name&&!data.text.includes(n.target.name)));
}
// The subject carried on to the end of text, as the product reads a sentence written there (自分 is {kind:'self'}); null
// when the text there does not read.
function assistTopicAt(text: string,ctx: AssistContext): ActorRef | null {
  const mark='あかりの目印';let said: AssistNode | undefined;
  try{said=assistNodes(parseSyntax(text+'「'+mark+'」と言う。',ctx).ast).find(n=>n.kind==='Say'&&n.value?.value===mark);}catch{return null;}
  return said?said.actorRef||{kind:'self'}:null;
}
// A near sentence does not change the other sentences (LANGUAGE.md 読めない文の近い書き方). One that names another subject
// (ねこは…) would carry it on to the next sentence written without one, at the same depth (ねこは…。「やあ」と言う。); that
// sentence is given the subject it had there: the one carried on to the place of the near sentence, else 自分. The
// result is where the next sentence begins and what is written up to it, or null when nothing is to be written.
function assistNextSubject(basis: string,start: number,end: number,written: string,indent: number,ctx: AssistContext,project: Project,topic: { before?: ActorRef | null }) {
  const owner=project.components.find(c=>c.id===ctx.targetId)?.name;if(!owner)return null;
  let at=end;while(['。',' ','\t'].includes(basis[at]))at++;
  while(basis[at]==='\n'){const lineEnd=basis.indexOf('\n',at+1),line=basis.slice(at+1,lineEnd<0?basis.length:lineEnd);
    // (the pattern of the indent matches every line)
    if(line.trim()&&!line.trim().startsWith('※')){if(line.match(/^\s*/)![0].length!==indent)return null;at=at+1+indent;break;}at=lineEnd<0?basis.length:lineEnd;}
  if(at>=basis.length||basis[at]==='\n')return null;
  // A heading (「スペース」キーがおされたとき、) begins a body of its own, which carries on no subject.
  const next=basis.slice(at).split('\n')[0].trim();
  try{if(readSentenceHeading(next.replace(/。$/,''),ctx.symbols,null,ctx))return null;}catch{}
  const names=[...project.components.map(c=>c.name),'自分','みんな','全体'].sort(assistLongestFirst).map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
  if(new RegExp('^「?(?:'+names+')」?(?:は|が|も|だけ|、)').test(basis.slice(at)))return null;
  if(!('before' in topic))topic.before=assistTopicAt(basis.slice(0,start),ctx);
  const after=assistTopicAt(basis.slice(0,start)+written+(basis[end]==='。'?'。':''),ctx),who=(r: ActorRef | null | undefined)=>r?.kind==='named'?r.name:r?.kind==='self'?owner:null;
  if(!topic.before||!after||who(topic.before)===who(after))return null;
  // A heading (もし…、 3回くり返す。) takes its subject with 、 (自分は、3回くり返す。), as the code is written.
  const subject=sentenceActorSource(who(topic.before)===owner?{kind:'self'}:topic.before)+(/^もし|、$|(?:くり返す|繰り返す|くりかえす)。?$/.test(next)?'は、':'は');
  return {at,between:basis.slice(end,at)+subject,note:`つぎの 文の はじめに「${subject}」を 書きます（つぎの 文は、これまでどおり ${who(topic.before)}が します）`};
}
// A proposal of a check (the rewrite buttons under a sentence that does not read) keeps who does the next sentence, as
// a near sentence does.
export function assistProposalKeepsSubject(proposal: Proposal & { description?: string },basis: unknown,ctx: AssistContext,project: Project): Proposal & { description?: string; note?: string } {
  if(typeof basis!=='string'||typeof proposal?.source!=='string'||proposal.input||!Number.isInteger(proposal.start)||!Number.isInteger(proposal.end))return proposal;
  // (isInteger: the places are numbers; the pattern of the indent matches every line)
  const indent=basis.slice(basis.lastIndexOf('\n',proposal.start!-1)+1).match(/^[ \t]*/)![0].length,kept=assistNextSubject(basis,proposal.start!,proposal.end!,proposal.source,indent,ctx,project,{});
  return kept?{...proposal,source:proposal.source+kept.between,end:kept.at,description:[proposal.description,kept.note].filter(Boolean).join(' '),note:kept.note}:proposal;
}
// A candidate made whole from one that leaves out a subject or a time written: ねこは, 2秒かけて、 (the time the action
// takes) or 2秒待ってから、 (a wait before it); a time that may be either gives both. Each is checked as any candidate.
function assistMeaningCompletions(text: string,want: AssistWant[] | null,parts: string[]) {
  if(!want)return [];
  // A line for each frame, or a line for each action with the wait before it written in that line (2秒待ってから、).
  const lines=String(text).trim().replace(/。$/,'').split(/。?\n/),merged=lines.length!==want.length,main=merged?want.filter((w,i)=>!(w.action==='wait'&&want[i+1]&&want[i+1].action!=='wait')):want;
  if(lines.length!==main.length||lines.some(line=>/^\s/.test(line)))return [];
  let options=[''];
  for(const [i,line]of lines.entries()){const w=main[i],at=want.indexOf(w),wait=merged&&at>0&&want[at-1].action==='wait'&&w.action!=='wait'?want[at-1].quantities[0]?.value:null;
    const head=/^([^、。「」]+?)(?:は|が)、?/.exec(line),named=head&&[...parts,'自分'].includes(head[1]),subject=named?head[0]:w.subject&&w.action!=='wait'?w.subject+'は':'',body=named?line.slice(head[0].length):line;
    const time=w.quantities.find(q=>q.unit==='秒'&&q.role!=='wait'),ways: string[]=[];
    if(time&&!/秒/.test(body)&&['move','turn'].includes(w.action)){ways.push(time.value+'秒かけて、'+body);if(time.role==='unknown'&&wait==null)ways.push(time.value+'秒待ってから、'+body);}else ways.push(body);
    options=options.flatMap(prefix=>ways.map(way=>prefix+(i?'\n':'')+subject+(wait!=null&&!/待って/.test(way)?wait+'秒待ってから、':'')+way));
  }return options.filter(option=>option.replace(/[\s。]/g,'')!==String(text).replace(/[\s。]/g,''));
}
// Parts written together as the subject (ねこと犬は…, ねこも犬も…, ねこと犬を…させる) are no one part, so no sentence of one
// part keeps them (LANGUAGE.md 読めない文の近い書き方): the parts in the order written, how each is written (は, or を／に
// for a part made to do it) and what they do; null when the subject is one part.
function assistListedSubjects(text: string,project: Project | null | undefined): AssistListed | null {
  const names=[...(project?.components||[]).map(c=>c.name),'自分'].sort(assistLongestFirst).map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
  const m=new RegExp('^((?:「?(?:'+names+')」?(?:と|、|も|や))+「?(?:'+names+')」?)(は|が|も|を|に)、?(?:いっしょに|一緒に|ともに|みんなで|みんな|ふたりで|二人で)?、?(.+)$').exec(text);
  // Parts named in a heading (ねこと犬がふれたとき、) are what happens, not who does it.
  if(!m||/とき|たら|ごとに|たびに/.test(m[3]))return null;
  // A part written twice (ねことねこは) is that one part.
  const parts=[...new Set([...m[1].matchAll(new RegExp('「?('+names+')」?','g'))].map(x=>x[1]))],made=['を','に'].includes(m[2]);
  if(made&&!/させ|せる|せて|かす|かして|かせ/.test(m[3])&&!(m[2]==='を'&&ASSIST_PART_VERBS.test(m[3]))||m[2]==='に'&&/知らせ|しらせ|見せ|みせ/.test(m[3]))return null;
  return {parts,particle:made?m[2]:'は',rest:m[3]};
}
// A sentence for each of the parts, in the order written: the near sentences of a part that is not the body's owner (one
// for each meaning of a time that may be either), with each part's name in its place. A wait is the body's, written once,
// as the check writes ねこと犬は1秒待ってから、… and ねこも犬も1秒待つ (LANGUAGE.md 読めない書き方).
function assistListedSplits(listed: AssistListed,project: Project,ctx: AssistContext) {
  if(listed.rest===null)return [];
  const owner=project.components.find(c=>c.id===ctx.targetId)?.name,first=listed.parts.find(name=>name!==owner&&name!=='自分')??owner;
  // (the body is a part's: the stage's parts are looked for in a part's body)
  const head=new RegExp('^「?'+first!.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'」?は、?'),waitLine=/^(?:[^、。]+は、?)?(\d+(?:\.\d+)?)秒待つ。?$/,line=first+listed.particle+listed.rest+'。',splits=new Map<string, string | undefined>();let found: string[]=[];
  try{const d=parseSyntax(line,ctx).syntaxDiagnostics[0],fixes=(d?.proposals||[]).filter(f=>f.start===0),fixed=!d?line:fixes.length===1?fixes[0].source+line.slice(fixes[0].end):null,read=fixed&&assistCanonical(fixed,ctx);
    found=read?[read.text]:d?assistCandidates(project,line,ctx,d).map(c=>c.text):[];}catch{}
  for(const text of found){
    const [one,two,...more]=text.trim().split('\n'),wait=waitLine.exec(one),act=wait?two:one;
    if(more.length||two!==undefined&&!wait||act!==undefined&&!head.test(act))continue;
    const sentences=act===undefined?[]:listed.parts.map(name=>sentenceActorSource(name==='自分'?{kind:'self'}:{kind:'named',name})+'は'+act.replace(head,'')),split=[...(wait?[wait[1]+'秒待つ。']:[]),...sentences].join('\n');
    if(!splits.has(split))splits.set(split,listed.parts.length>1?inTurnLabel(wait?'この 本文で 待つ':'文を 分ける',inTurnAction(sentences.join(''))):undefined);
  }
  return [...splits].slice(0,ASSIST_MAX);
}
function assistStructuredTransforms(text: string,data: AssistData,project: Project,ctx: AssistContext,basis: string,range: AssistRange) {
  const sources: AssistSource[]=[],add=(text: string,extra: Omit<AssistSource, 'text'>={})=>sources.push({text,...extra}),indent=(body: string)=>body.split('\n').map(line=>'  '+line).join('\n');
  const read=(source: string,wait=false)=>{
    const forms=assistClauseForms(source);
    for(const form of forms){const parsed=assistCanonical(form,ctx);if(parsed&&!(parsed.ast.heading)&&!(parsed.ast.body?.[0]?.kind==='IfStatement'))return parsed.text;}
    const candidates=assistSearch(project,basis,range,ctx,assistSeeds(source,ctx.symbols,ctx)).filter(c=>c.layer<6).sort((a,b)=>assistCompare(a,b,ctx));
    if(wait){const sample=candidates.find(c=>c.schemaId==='SoundCommand:SAMPLE_WAIT');if(sample)return sample.text;}
    return candidates[0]?.text;
  };
  const isCondition=(source: string)=>{for(const form of ['if','while','until','plain'] as const)try{parseCondition(source,ctx.symbols,ctx,form);return true;}catch{}return false;};
  let m: RegExpExecArray | null;
  if(ctx.event==='cloneStart'&&/^自分だけ消える$/.test(text))for(const id of ['CloneCommand:DELETE_SELF','LooksCommand:HIDE']){const hint=hintCandidates(project,ctx.targetId,{...ctx,source:basis,start:range.lineStart+range.indent,end:range.lineEnd}).find(h=>h.id===id&&h.enabled);if(hint)add(hint.text);}
  if((m=/^(\d+(?:\.\d+)?)秒のあいだ待つ$/.exec(text)))add(m[1]+'秒待つ。');
  if((m=/^(.+?)(\d+(?:\.\d+)?秒(?:待つ|まつ))$/.exec(text))&&/[うくぐすつぬぶむるみ]$|(?:たあと|だあと)$/.test(m[1])){const before=read(m[1].replace(/あと$/,'')),after=read(m[2]);if(before&&after)add(before+'\n'+after);}
  if(/とばして(?:次|つぎ)へ$/.test(text)){const hint=hintCandidates(project,ctx.targetId,{...ctx,source:basis,start:range.lineStart+range.indent,end:range.lineEnd}).find(h=>h.id==='Continue'&&h.enabled);if(hint)add(hint.text);}
  const own=project.components.find(c=>c.id===ctx.targetId)?.name;
  if(own&&new RegExp('^(?:自分|'+own.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')(?:の動きを|を)?(?:全部|だけ)?(?:止まる|止める|とまる|とめる)$').test(text)){add('自分のほかの動きを止める。\nこの動きを止める。');add('この動きを止める。');}
  // (with no direction the key is undefined, which is no key of the table; the Say found is in the sentence read)
  if((m=/^(\d+(?:\.\d+)?)秒に(\d+(?:\.\d+)?)歩の速さで、?(.+)$/.exec(text))&&!/続ける|つづける/.test(m[3])){const motion=searchIntent(m[3],ctx),direction=({right:'右',left:'左',up:'上',down:'下'} as Partial<Record<string, string>>)[motion?.direction as string];if(direction)add(m[1]+'秒かけて、いまのばしょから、'+direction+'へ'+m[2]+'歩動く。');else if(motion?.direction==='forward')add('前へ'+m[2]+'歩進む。\n'+m[1]+'秒待つ。');}
  for(const list of project.projectData?.lists||[]){const q=list.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');if((m=new RegExp('^'+q+'(?:の中身)?を(?:全部)?(?:(?:一|1)つずつ)?(?:順に|順番に)?(?:(\\d+(?:\\.\\d+)?)秒ずつ)?(?:言う|話す)$').exec(text))&&/順|(?:一|1)つずつ|全部/.test(text)){const hint=hintCandidates(project,ctx.targetId,{...ctx,source:basis,start:range.lineStart+range.indent,end:range.lineEnd}).find(h=>h.id==='each:'+list.name&&h.enabled);if(hint){const parsed=assistCanonical(hint.text,ctx),node=parsed?.ast?.body?.[0],say=node?.body?.find(n=>n.kind==='Say');if(say){say.seconds=sentenceQuantity({kind:'NumberLiteral',value:Number(m[1]||1)},'秒');add(formatScript(parsed!.ast));}}}}
  if(data.subject&&/^\d+回/.test(text))add(data.subject+'が'+text);
  add(text.replace(/を答えにして返す$/,'を答えとして返す'));
  add(text.replace(/を(.+?)で、(?=【[^【】]+】という(?:手順|てじゅん)を行う)/,'を$1として、'));
  if((m=/^([^、]+)と([^、]+)をわたして、(.+)$/.exec(text)))add('（'+m[1]+'、'+m[2]+'）をわたして、'+m[3]);
  if(/という(?:手順|てじゅん)をずっと行う$/.test(text)){const body=read(text.replace('をずっと行う','を行う'));if(body)add('ずっとくり返す。\n'+indent(body));}
  if(/^(?:「[^「」]+」|[^「」、]+)が.*(?:以上|以下|より|同じ)/.test(text)&&!/なら|あいだ|まで|たら|とき/.test(text)&&/待つ$/.test(text))add(text.replace(/(以上で|以下で)(?!、)/g,'$1、').replace(/キーがおされるまで待つ$/,'キーがおされている状態になるまで待つ'));
  if(/^(?:それ以外(?:は|のとき)?|それいがい(?:は|のとき)?|そうでないと|でないと|ほかは|もしそうでなければ|じゃなければ)$/.test(text))add(basis.slice(0,range.start)+'そうでなければ、'+basis.slice(range.end),{schemaId:'IfStatement',start:0,end:basis.length,whole:true});
  if((m=/^(もし.+?、)(もし.+)$/.exec(text)))add(basis.slice(0,range.start)+m[1]+'\n  '+m[2]+basis.slice(range.end),{schemaId:'IfStatement',start:0,end:basis.length,whole:true});
  if(/^(?:みんな|全員|全部|すべて)(?:止まる|とまる)$/.test(text))for(const op of ['ALL','OTHERS']){const hint=hintCandidates(project,ctx.targetId,{...ctx,source:basis,start:range.lineStart+range.indent,end:range.lineEnd}).find(h=>h.id==='StopCommand:'+op&&h.enabled);if(hint)add(hint.text);}
  if(ctx.definitionKind==='action'&&/^(?:全部|ぜんぶ)終わるまで待つ$/.test(text)&&/「[^「」]+」の合図を送る。$/.test(basis.slice(0,range.lineStart).trimEnd()))add('その合図で始まったことが全部終わるまで待つ。',{schemaId:'WaitBroadcastGroup'});
  if((m=/^(?:タイマーが)?(\d+(?:\.\d+)?)秒(?:間)?(?:たつ|すぎる|がすぎる|たつの)(?:まで待つ|を待つ)$/.exec(text)))add(m[1]+'秒待つ。');
  if((m=/^(\d+(?:\.\d+)?)秒(?:半|はん)待つ$/.exec(text)))add((Number(m[1])+0.5)+'秒待つ。');
  if((m=/^(\d+(?:\.\d+)?)秒(?:たったら|すぎたら)、?(.+)$/.exec(text))){const body=read(m[2]);if(body)add(m[1]+'秒待つ。\n'+body);}
  if((m=/^(?:(?:ずっと|いつも)?(\d+(?:\.\d+)?)(?:秒|びょう)(?:ごとに|おきに|たつごとに|に1回)(?:ずっと)?|毎秒)、?(.*)$/.exec(text))&&ctx.definitionKind!=='function'){
    const actor=/^(.*?)は$/.exec(m[2]);const tail=actor&&[project.components.find(c=>c.id===ctx.targetId)?.name,'自分'].includes(actor[1])?'':m[2];
    const body=tail?read(tail):'',header='ずっとくり返す。\n  '+(m[1]||1)+'秒待つ。';if(!tail||body&&!actor)add(header+(body?'\n'+indent(body):''));
  }
  // Repetition and sustained actions use the existing readable sentence/hint as their body.
  if((m=/^(.*?)((?:\d+))回(.+)$/.exec(text))&&!/くり返|くりかえ|繰り返/.test(m[3])){
    const body=read(m[1]+m[3],true);if(body)add(m[2]+'回くり返す。\n'+indent(body));
  }
  if((m=/^[「『](.+)[」』]を(\d+)回くり返す$/.exec(text))){
    const clauses=assistSplit(m[1],'。').map(c=>read(c.text));if(clauses.length&&clauses.every(Boolean))add(m[2]+'回くり返す。\n'+indent(clauses.join('\n')));
  }
  if((m=/^(\d+(?:\.\d+)?)秒(?:のあいだに?|間|たつまで)(?:、)?(?:ずっと)?(?:くり返す)?(?:、)?(.*)$/.exec(text))|| (m=/^(\d+(?:\.\d+)?)秒くり返す(.*)$/.exec(text))){
    const tail=m[2].replace(/^、/,'');if(!tail||tail==='くり返す')add('タイマーを0にする。\nタイマーが'+m[1]+'以上になるまで、くり返す。',{schemaId:'RepeatUntil',description:'タイマーを 0に もどします'});
    else if(!/続ける|つづける|^(?:待つ|まつ)$/.test(tail)){const body=read(tail);if(body)add('タイマーを0にする。\nタイマーが'+m[1]+'以上になるまで、くり返す。\n'+indent(body),{schemaId:'RepeatUntil',description:'タイマーを 0に もどします'});}
  }
  if(!/(?:キー|おしっぱなし|くり返|くりかえ|繰り返)/.test(text)&&(/続ける|つづける/.test(text)||/^(?:ずっと|ずーっと|くり返し)/.test(text))){
    let action=text.replace(/^(?:ずっと|ずーっと|くり返し)、?/,'');
    const duration=/^(\d+(?:\.\d+)?)秒(?:のあいだ|間)、?/.exec(action);if(duration)action=action.slice(duration[0].length);
    const speed=/(\d+(?:\.\d+)?)秒に(\d+(?:\.\d+)?)歩の速さで、?/.exec(action);if(speed)action=action.replace(speed[0],'');
    let until=/^(.+?まで)、?/.exec(action);if(until)action=action.slice(until[0].length);
    const stem=action.replace(/(?:続ける|つづける)$/,''),dictionary=[...meijinDictionary(stem),...assistClauseForms(stem)],bodyOptions=[];
    if(speed&&/動き|うごき|進み|すすみ/.test(stem)){
      const direction=/(右|左|上|下|みぎ|ひだり|うえ|した)/.exec(stem)?.[1],word=direction&&({みぎ:'右',ひだり:'左',うえ:'上',した:'下'})[direction]||direction;
      bodyOptions.push(word?speed[1]+'秒かけて、いまのばしょから、'+word+'へ'+speed[2]+'歩動く。':'前へ'+speed[2]+'歩進む。\n'+speed[1]+'秒待つ。');
    }else if(stem.trim())for(const form of dictionary){if(form.length<2)continue;const actionForm=/動|うご|進|すす/.test(stem)&&!/(?:前|後ろ|右|左|上|下|まえ|うしろ|みぎ|ひだり|うえ|した)/.test(stem)?'前へ'+form:form,body=read(actionForm,true);if(body){bodyOptions.push(body);break;}}
    for(const body of bodyOptions){const header=until?until[1]+'、くり返す。':duration?duration[1]+'回くり返す。':'ずっとくり返す。';add(header+'\n'+indent(body));}
  }
  if((m=/^(.+?)(?:ながら|つつ|のと同時に|あいだ(?:に)?)、?(.+)$/.exec(text))&&!isCondition(m[1]+'あいだ')&&!/が|キー.*(?:おされ|おして)|ふれない|^\d+(?:\.\d+)?秒の?$/.test(m[1])){
    const stem=m[1],before=[...assistClauseForms(stem),...meijinDictionary(stem)].map(form=>read(form)).find(Boolean),after=read(m[2]);
    if(before&&after){const nonwaiting=(source: string)=>source.replace(/」を鳴らす。$/,'」を鳴らし始める。').replace(/」と\d+(?:\.\d+)?秒話す。$/,'」と言う。'),a=nonwaiting(before),b=nonwaiting(after),waits=(source: string)=>/秒|歩|待つ|鳴らす。/.test(source);
      add(!waits(a)&&waits(b)?a+'\n'+b:!waits(b)&&waits(a)?b+'\n'+a:a+'\n'+b);}
  }
  // Alternate control wording is converted before the full source is diagnosed again.
  add(text.replace(/(あいだ|まで)、?(?:ずっと|何度も)(くり返す|待つ)$/,'$1、$2').replace(/^くり返しつづける$/,'ずっとくり返す'));
  add(text.replace(/(あいだ|まで)、?(?:くりかえし|くり返し|ループ(?:する)?|リピート(?:する)?|つづける|くり返しする|ずっと)$/,'$1、くり返す'));
  add(text.replace(/(?:あいだは|あいだじゅう)、くり返す$/,'あいだ、くり返す').replace(/(?:までは|までの間|までに)、?くり返す$/,'まで、くり返す').replace(/(?:ときは|なら)、くり返す$/,'あいだ、くり返す').replace(/まえに、くり返す$/,'まで、くり返す'));
  add(text.replace(/まで(?:とまる|止まる|じっとする|じっとしている|そのまま|動かない|待機する|待機|たいきする)$/,'まで待つ').replace(/まで、待つ$/,'まで待つ'));
  if(/まで$/.test(text))add(text+(basis.slice(range.lineEnd+1).match(/^\s+/)?'、くり返す。':'待つ。'));
  add(text.replace(/^(?:何|なに)も(?:せず|しないで(?:ください|ね|おく)?|しなくていい(?:よ)?)$/,'何もしない'));
  add(text.replace(/^(?:何|なに)もしなくてよい$/,'何もしない'));
  add(text.replace(/とばして(?=次の回)/,'とばして、'));
  add(text.replace(/^(もし「[^「」]+」キー)(?:がおされた|をおした)(?:とき|なら)、?$/,'$1がおされていれば、'));
  add(text.replace(/あいだ、(?!(?:くり返す|$))/,'あいだ、くり返す。\n  ').replace(/まで、(?!(?:くり返す|$))/,'まで、くり返す。\n  '));
  if((m=/^(.+まで)、(.+)$/.exec(text))){const body=read(m[2]);if(body)add(m[1]+'待つ。\n'+body);}
  // Data operations keep their exact registered target, including operators adjacent to its name.
  for(const variable of project.projectData?.variables||[]){const q=variable.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    if((m=new RegExp('^'+q+'\\s*[＝=は]\\s*(.+?)(?:にする)?$').exec(text)))add(nameSource(variable.name)+'を'+m[1]+'にする');
    if((m=new RegExp('^'+q+'を?([+＋−－-])(\\d+)(?:する)?$').exec(text)))add(nameSource(variable.name)+'を'+m[2]+(/[+＋]/.test(m[1])?'ふやす':'へらす'));
    add(text.replace(new RegExp('^'+q+'を(.+?)に(?:ふやす|増やす|へらす|減らす)$'),(_match: string, g1: string) => nameSource(variable.name)+'を' + g1 + 'にする'));
    add(text.replace(new RegExp('^'+q+'を(.+?)と(?:おく|置く)$'),(_match: string, g1: string) => nameSource(variable.name)+'を' + g1 + 'にする'));
    add(text.replace(new RegExp('^'+q+'を(.+?)(?:から|で)(?:始める|はじめる|スタートする)$'),(_match: string, g1: string) => nameSource(variable.name)+'を' + g1 + 'にする'));
  }
  if((m=/^大きさを(-?\d+)ずつ(?:変える|かえる)$/.exec(text)))add('大きさを（大きさ'+(Number(m[1])<0?'−':'＋')+Math.abs(Number(m[1]))+'）％にする');
  for(const list of project.projectData?.lists||[]){const q=list.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    if((m=new RegExp('^'+q+'から「([^「」]+)」を(?:消す|けす|取り出す)$').exec(text)))add(nameSource(list.name)+'の（'+nameSource(list.name)+'の中で「'+m[1]+'」がはじめて出てくる番号）番目を消す');
  }
  // These expressions share the existing 名人 arithmetic meaning, without adding reader forms.
  if((m=/^(もし)?(.+?)が(.+?)(になるまで|のあいだ|であるあいだ|あいだ|なら)(.*)$/.exec(text))&&new RegExp('^'+MEIJIN_WORD+'$').test(m[3])){
    const subject=m[2],word=meijinWordSpelling(m[3]),mode=/あいだ$/.test(m[4])?'while':m[4]==='になるまで'?'until':'if',ending=mode==='while'?'であるあいだ':mode==='until'?'になるまで':'なら',prefix=mode==='if'?'もし':'',tail=m[5];
    try{const check=meijinWordCheck(subject,word);if(check.same)add(prefix+(mode==='while'?check.same:check.same.replace(/と同じ$/,''))+ending+tail+(mode==='while'&&!tail?'、くり返す':''));
      else if(/の倍数$/.test(word)){const value=word.slice(0,-3),last=subject+'÷'+value+'のあまりが0'+(mode==='while'?'と同じ':'')+ending;add(prefix+subject+'が0とちがっていて、'+last+tail);add(prefix+last+tail);}
      else add(prefix+meijinWordTest(subject,word,m[4])+tail);
    }catch{}
  }
  if((m=/^(もし)?(.+?)が(\d+)で割り切れるなら(.*)$/.exec(text)))add('もし'+m[2]+'÷'+m[3]+'のあまりが0なら'+m[4]);
  // The arithmetic rewrites already used by 名人 are also valid ordinary conditions.
  if(/倍数|約数|偶数|奇数|割り切|からっぽ|より[右左上下]/.test(text)){
    try{let source=text.replace(/ばいすう/g,'倍数');if(/より[右左上下]/.test(source)){source=source.replace(/より([右左上下])なら/,'より$1にいれば');let implicit=false;if(!/(?:「[^「」]+」|[^もし、]+)が.+より/.test(source)){source=source.replace(/^もし/,'');source=(data.subject||own)+'が'+source;implicit=!data.subject;}const written=meijinRewrite(source,ctx.symbols,ctx);if(written){let result=written;if(implicit)result=result.replace('「'+own+'」のよこのばしょ','よこのばしょ').replace('「'+own+'」のたてのばしょ','たてのばしょ');if(!result.startsWith('もし')&&/ければ/.test(result))result='もし'+result;add(result);}}
      else{const written=meijinRewrite(source+(/、$/.test(range.text)&&!source.endsWith('、')?'、':''),ctx.symbols,ctx);if(written)add(written);}
    }catch{}
  }
  return sources.filter(entry=>entry.text!==text);
}
function assistSignalTransforms(text: string,project: Project,ctx: AssistContext,basis: string,range: AssistRange) {
  if(ctx.definitionKind)return [];
  const sources: AssistSource[]=[],signals=ctx.signalNames||{sent:[],received:[]},names=[...new Set([...signals.sent,...signals.received])],owner=project.components.find(c=>c.id===ctx.targetId),known=(source: string)=>source.replace(/[「」]/g,'').split(/と|、/).every(name=>project.components.some(c=>c.name===name)),sendName=()=>signals.received.find(n=>!signals.sent.includes(n))||signals.received[0]||'開始';
  const add=(text: string,schemaId: string,description?: string | null)=>sources.push({text,schemaId,...(description?{description}:{})}),send=(name: string,description?: string)=>add('「'+name+'」の合図を送る。','Broadcast',description),receive=(name: string | null,body='',description?: string)=>{if(ctx.targetId!=='stage'&&range.indent===0)add(sentenceHeadingSource({event:'message',actorRef:{kind:'self'},filter:name?{message:name}:null})+(body?'\n  '+body.replace(/\n/g,'\n  '):''),'Heading:message',description);};
  let m: RegExpExecArray | null;
  if((m=/^(.+?)(?:に|へ)「([^「」]+)」(?:と(?:言って)?(?:知らせ|つたえ|教え|伝え)(?:る|て|ます)|の合図を(?:送る|おくる|送って|送ります))$/.exec(text))&&known(m[1]))send(m[2],'合図は、作品の みんなに とどきます');
  if((m=/^「([^「」]+)」の合図を(.+?)に(?:送る|おくる|送ります)$/.exec(text))&&known(m[2]))send(m[1],'合図は、作品の みんなに とどきます');
  if((m=/^(.+?)(?:に|へ)「([^「」]+)」と(?:言う|話す|いう)$/.exec(text))&&known(m[1])){send(m[2],'合図は、作品の みんなに とどきます');add('「'+m[2]+'」と言う。','Say');}
  if(/^合図を(?:送る|出す)$/.test(text))send(sendName());
  if(/^合図を送って、?待つ$/.test(text))add('「'+sendName()+'」の合図を送って、その合図で始まったことが全部終わるまで待つ。','BroadcastAndWait');
  if((m=/^(.+?)(?:から|の)(?:「([^「」]+)」の)?合図(?:が来た|がきた|が届いた|がとどいた|を受けた|をうけた|を受け取った|をもらった|を受信した)(?:とき|ら)、?$/.exec(text))&&known(m[1])){
    const sender=m[1].replace(/[「」]/g,''),choices=m[2]?(names.includes(sender+'から'+m[2])?[sender+'から'+m[2]]:names.includes(m[2])?[m[2]]:[m[2],sender+'から'+m[2]]):names.filter(name=>name.startsWith(sender+'から'));
    if(!choices.length)choices.push(sender+'から出発');for(const name of choices.slice(0,ASSIST_MAX))receive(name,'','送る ほうも「'+name+'」という 名前で 送ります');
  }
  if((m=/^「([^「」]+)」(?:の合図(?:が来た|がきた|が届いた|がとどいた)|が(?:来た|きた|届いた)|の合図を(?:もらった|受信した))(?:とき|ら)、?(.*)$/.exec(text))){
    let body=m[2],subject=/^(.+?)は、?$/.exec(body);if(subject){if(subject[1]!==owner?.name)return sources;body='';}receive(m[1],body);
  }
  if((m=/^(?:【([^【】]+)】|([^「」]+?))(?:の|という)?合図を受けたとき、?$/.exec(text))&&names.includes(m[1]||m[2]))receive(m[1]||m[2]);
  if(/^合図(?:が来た|がきた|が届いた|がとどいた)とき、?$/.test(text))receive(null);
  if((m=/^(?:(.+?)(?:に|へ))?「([^「」]+)」(?:の合図を(?:送って|おくって)(?:から)?|(?:と|を(?:みんなに)?)知らせて)、?(.*(?:待つ|まつ|待ちます))$/.exec(text))&&(!m[1]||known(m[1])))
    add('「'+m[2]+'」の合図を送って、その合図で始まったことが全部終わるまで待つ。','BroadcastAndWait',m[1]?'合図は、作品の みんなに とどきます':null);
  if(/^(?:その合図で始まったことが)?(?:全部|ぜんぶ|みんなが|みんなの仕事が|受けた人が)?(?:終わる|おわる)(?:まで|のを)、?(?:待つ|まつ|待ちます|待って)$/.test(text)){
    const previous=basis.slice(0,range.lineStart).trimEnd().split('\n').at(-1)||'',sent=/「([^「」]+)」の合図を送る。$/.exec(previous),wait='その合図で始まったことが全部終わるまで待つ。';
    add(sent?wait:'「'+sendName()+'」の合図を送る。\n'+wait,'WaitBroadcastGroup');
  }
  return sources;
}
// With the meaning of every clause known (framed), two clauses that do not read are each searched and put together.
function assistCompose(project: Project,basis: string,range: AssistRange,ctx: AssistContext,data: AssistData,framed: boolean): { sources: AssistSource[]; composed: boolean } {
  // A clause put together: the sentences it may be written as (the block of each, and whether a number of it is left
  // as it was), whether it reads as written, its condition and its block.
  type Option = { text: string; schemaId?: string; defaultNumericSlots?: boolean };
  type Part = { condition?: string; options: Option[]; readable: boolean; schemaId?: string };
  if(searchIntent(data.text)?.schemaId==='ContinuousRule')return {sources:[],composed:false};
  if(data.strings.length&&(/(?:たずね|聞[くいき]|き[くい]|質問|しつもん|言って|といい).*(?:答え|こたえ|返事)/.test(data.text)||/(?:合図.*(?:送|おく)|知らせて).*(?:待|まつ)/.test(data.text)))return {sources:[],composed:false};
  if(/をわたして|として|という(?:手順|てじゅん)を/.test(data.text))return {sources:[],composed:false};
  if(/(?:あいだ(?:は|じゅう)?|まで)、?(?:ずっと|何度も|くりかえし|くり返し|ループ(?:する)?|リピート(?:する)?|つづける|くり返しする|くり返す)$/.test(data.text))return {sources:[],composed:false};
  const clauses=data.clauses.map(c=>c.text.trim()).filter(Boolean);
  const conditional=clauses.length>1&&/^(?:もし|.*(?:たら|れば|なら|とき|あいだ|まで)$)/.test(clauses[0]);
  const connective=clauses.length>1&&/(?:て|で|たら|たあと|た後に|た後で)$/.test(clauses[0]);
  if(!conditional&&!connective)return {sources:[],composed:false};
  const parts=clauses.map((text,index): Part=>{
    if(index===0&&conditional)return {condition:text,options:[{text}],readable:true};
    for(const form of assistClauseForms(text)){
      try{const parsed=parseSyntax(form+'。',ctx);if(parsed.ast)return {options:[{text:formatScript(parsed.ast).trim()}],readable:true,schemaId:syntaxSchema(parsed.ast.body?.[0])?.id||parsed.ast.body?.[0]?.kind};}catch{}
    }
    const seeds=assistSeeds(text,ctx.symbols,ctx),options=assistSearch(project,basis,range,ctx,seeds).filter(c=>c.layer<6).sort((a,b)=>/^音を出/.test(text)?Number(b.schemaId==='SoundCommand:SAMPLE_WAIT')-Number(a.schemaId==='SoundCommand:SAMPLE_WAIT')||assistCompare(a,b,ctx):assistCompare(a,b,ctx)).slice(0,3).map(c=>({text:c.text,schemaId:c.schemaId,defaultNumericSlots:c.defaultNumericSlots}));
    return {options,readable:false};
  });
  // With the meaning of each clause known, up to three unreadable clauses are put together: three clauses of moves took
  // 265 ms here and four 359 ms, past the 300 ms the near sentences are given (ASSIST_BUDGET_MS).
  const unreadable=parts.filter(p=>!p.readable);if(unreadable.length>(framed?3:1)||parts.some(p=>!p.options.length))return {sources:[],composed:true};
  const index=parts.findIndex(p=>!p.readable),sources: AssistSource[]=[],same=(a: Option,b: Option)=>a.text.replace(/[\s。]/g,'')===b.text.replace(/[\s。]/g,'');
  // A replacement that keeps a number the child did not write is not used, nor, when the meaning is not known, one that
  // says what a readable clause says (with the meaning known, 前へ10歩進んで、前に10歩いく。 is two moves).
  let combos: Option[][]=[[]];for(const [i,part]of parts.entries())combos=combos.flatMap(combo=>(part.readable?[part.options[0]]:part.options.filter(o=>!o.defaultNumericSlots&&(framed||!parts.some((q,k)=>k!==i&&q.readable&&same(q.options[0],o))))).map(o=>[...combo,o]));
  // (a replacement is there where a clause does not read)
  for(const combo of combos){
    const replacement=index>=0?combo[index]:null,texts=combo.map(o=>o.text),extra=index>=0&&!/^もし/.test(data.text)&&(index===0||conditional||parts[0].schemaId==='WaitTime')?{schemaId:replacement!.schemaId}:{};
    if(conditional){const action=texts.slice(1).join('\n');
      if(/^(?:もし|.+あいだ、|.+まで、|.+ふれていれば、はね返る)/.test(action))sources.push({text:action,...extra});
      else sources.push({text:texts[0]+'、'+action,...extra});
    }else sources.push({text:texts.join('\n'),...extra});
  }
  if(conditional)for(const candidate of assistSearch(project,basis,range,ctx,data)){
    if(searchReading(candidate.text).startsWith(searchReading(clauses[0]+'、')))sources.push({text:candidate.text,schemaId:candidate.schemaId});
  }
  return {sources,composed:true};
}
function assistTransforms(text: string,data: AssistData,project: Project,ctx: AssistContext) {
  const out=new Set<string>(),add=(s: string)=>{if(s&&s!==text)out.add(s);},quoted: string[]=[],protectedText=text.replace(/「[^「」]*」|『[^『』]*』|｢[^｢｣]*｣|"[^"]*"/g,s=>'「§'+(quoted.push(s)-1)+'§」');
  for(const v of searchQueryVariants(protectedText,{condition:true}))add(v.replace(/「§(\d+)§」/g,(_: string,i: `${number}`)=>quoted[i]));
  const restore=(source: string)=>source.replace(/「§(\d+)§」/g,(_: string,i: `${number}`)=>quoted[i]);
  const condition=/^(?:もし|.*(?:なら|ならば|たら|れば|とき(?:は)?|あいだ|間|まで|場合|うちは|かぎり)$)/.test(data.clauses[0]?.text||'')||/まで(?:待つ|まつ)$/.test(text);
  if(condition){
    const pieces=assistSplit(protectedText,'、'),head=pieces[0];
    if(head)for(const variant of searchQueryVariants(head.text,{condition:true}))add(restore(variant+protectedText.slice(head.end)));
    let normalized=protectedText;
    normalized=normalized.replace(/ふくまれて/g,'含まれて').replace(/はいって/g,'入って').replace(/でかつ|でさらに|そして|かつ/g,'で').replace(/か、または/g,'か、').replace(/もしくは|または/g,'か');
    for(const form of CONDITION_FORMS)for(const ending of [form.andYes,form.andNo].filter(Boolean).sort((a,b)=>b.length-a.length)){
      const suffix=ending.replace(/[、。]+$/,'');if(suffix)normalized=normalized.split(suffix).map((part,i,all)=>i===all.length-1?part:part+suffix).join('、').replace(/、、/g,'、');
    }
    normalized=normalized.replace(/(以上|以下|大きい|小さい|と同じ|ではない|とちがう|いる|いない|である)か(?!、)/g,'$1か、').replace(/より(大きく|小さく)、/g,'より$1て、');
    add(restore(normalized));
    const conditionVariants=new Set([protectedText,normalized,...searchQueryVariants(protectedText,{condition:true})]);
    for(const input of conditionVariants){
      let v=input.replace(/^もしコピー/,'もし自分がコピー').replace(/てる(?=あいだ|なら|、)/g,'ている').replace(/てなければ/g,'ていなければ').replace(/ているなら/g,'ていれば').replace(/ふれるなら/g,'ふれていれば').replace(/じゃなかった(?:なら|ら)/g,'と同じでなければ').replace(/(大き|小さ)くなったら/g,'$1ければ').replace(/になったとき(?:は)?/g,'になったら').replace(/(?:うちは|かぎり|の間は|間は)/g,'あいだ');
      if(/^もし自分がコピー/.test(v))v=v.replace(/じゃなかったら|と同じでなければ/,'でなければ');
      if(data.names.some(n=>n.kind==='list'))v=v.replace(/に(「§\d+§」)(?:が)?(?:いる|いた|入っていた)(?:なら|と)/g,'に$1が入っていれば');
      if(/以上で|以下で/.test(v)&&/キーがおされるまで待つ$/.test(v))v=v.replace(/(以上で|以下で)(?!、)/g,'$1、').replace(/キーがおされるまで待つ$/,'キーがおされている状態になるまで待つ');
      if(/(?:大き|小さ)ければ$/.test(v)&&!v.startsWith('もし'))v='もし'+v;
      add(restore(v));
    }
    add(restore(protectedText.replace(/より上/g,'より大きい').replace(/より下/g,'より小さい').replace(/と等しい/g,'と同じ').replace(/をこえる/g,'より大きくなる').replace(/(\d+(?:\.\d+)?)(?:てん|点|こ|個|ほ|歩|ど|度|パーセント|％)(?=以上|以下|より|と|なら|にな)/g,'$1')));
    add(restore(protectedText.replace(/くっつい|かさなっ|重なっ|さわっ|あたっ/g,'ふれ').replace(/くっつく|かさなる|重なる|さわる|あたる/g,'ふれる').replace(/クリックされた|クリックした/g,'おされた')));
  }
  add(text.replace(/，/g,'、').replace(/[．]/g,'。'));
  add(text.replace(/」って(?=言う|いう)/g,'」と'));
  add(text.replace(/(\d+(?:\.\d+)?)(?:パーセント|ぱーせんと|パー)/g,'$1％').replace(/(\d+)(?:びょう)/g,'$1秒').replace(/(\d+)(?:px|ピクセル)/g,'$1').replace(/(\d+)ばい/g,'$1倍').replace(/hz/gi,'Hz').replace(/秒間(?=[鳴な])/g,'秒'));
  if((text.match(/、/g)||[]).length===1)add(text.replace('、',''));else add(text.replace(/(\d+(?:\.\d+)?(?:歩|秒|度|％))、/g,'$1'));
  add(text.replace(/「([^「」]+)」/g,(s: string,name: string)=>data.names.some(n=>n.name===name)?name:s));
  for(const n of data.names){const name=n.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');add(text.replace(new RegExp('(?:変数|へんすう|リスト)'+name+'(?:の値|の中身)?','g'),() => (n.name)).replace(new RegExp(name+'(?:の値|の中身)','g'),() => (n.name)));}
  if(/^「[^「」]+」$/.test(text))add(text.slice(1,-1));
  add(text.replace(/^もし(?=.+(?:とき|たら)(?:、|$))/,''));
  add(text.replace(/になった(?:とき|ときは)、/g,'になったら、'));
  add(text.replace(/(毎秒|(?:(\d+(?:\.\d+)?)秒)(?:おきに|たつごとに|に1回))、?$/,(_: string,a: string,n: string | undefined)=>(n||1)+'秒ごとに、'));
  let m: RegExpExecArray | null;
  if((m=/^(\d+(?:\.\d+)?)秒(?:間)?ごとに、?$/.exec(text))&&ctx.definitionKind!=='function')add('ずっとくり返す。\n  '+m[1]+'秒待つ。');
  add(text.replace(/(?:それ以外(?:は|のとき)?|それいがい(?:は|のとき)?|そうでないと|でないと|ほかは|もしそうでなければ|じゃなければ)、?$/,'そうでなければ、'));
  add(text.replace(/(?:の場合(?:は|には)?|のばあい(?:は|には)?|だったとき|なとき|の時|だと|だったなら|だったとしたら|だとしたら|ならばね|ならね)、?$/,'なら、'));
  add(text.replace(/^(ずっと){2,}/,'ずっと'));
  add(text.replace(/^(?:\/\/|／／|#|＃|--|\* |\/\*)\s*(.*?)(?:\*\/)?$/,'※ $1').replace(/。\s*(?:\/\/|／／|#|＃|--|\/\*)\s*(.*?)(?:\*\/)?$/,'。  ※ $1'));
  // (each callback runs while m is the match just made)
  if((m=/^(.+?)を?([+＋−－-])(\d+)(?:する)?$/.exec(text))&&data.names.some(n=>n.kind==='variable'&&n.name===m![1]))add(m[1]+'を'+m[3]+(/[+＋]/.test(m[2])?'ふやす':'へらす'));
  if((m=/^(.+?)(?:＝|=|は)(.+?)(?:にする)?$/.exec(text))&&data.names.some(n=>n.kind==='variable'&&n.name===m![1]))add(m[1]+'を'+m[2]+'にする');
  if((m=/^(.+?)を(.+?)とする$/.exec(text))&&data.names.some(n=>n.kind==='variable'&&n.name===m![1]))add(m[1]+'を'+m[2]+'にする');
  if((m=/^(.+?)を(-?\d+)(?:ずつ変える|ずつかえる|大きくする|小さくする)$/.exec(text))&&(m[1]==='大きさ'||data.names.some(n=>n.kind==='variable'&&n.name===m![1])))add(m[1]+'を'+Math.abs(Number(m[2]))+((/小さく/.test(text)!==(Number(m[2])<0))?'へらす':'ふやす'));
  if((m=/^(.+?)を(\d+(?:\.\d+)?)(?:倍|ばい)にする$/.exec(text))&&data.names.some(n=>n.kind==='variable'&&n.name===m![1]))add(m[1]+'を'+m[1]+'×'+m[2]+'にする');
  if((m=/^向きを【?(.+?)】?にする$/.exec(text))&&data.names.some(n=>n.kind==='variable'&&n.name===m![1]))add('向きを【'+m[1]+'】度にする');
  if((m=/^(.+?)を(\d+)まで(ふやす|増やす|へらす|減らす)$/.exec(text))&&data.names.some(n=>n.kind==='variable'&&n.name===m![1])){add(m[1]+'を'+m[2]+'にする');add(m[1]+'が'+m[2]+(/ふやす|増やす/.test(m[3])?'以上':'以下')+'になるまで、くり返す。\n  '+m[1]+'を1'+(/ふやす|増やす/.test(m[3])?'ふやす':'へらす')+'。');}
  for(const name of data.names.filter(n=>n.kind==='list')){
    const q=name.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    add(text.replace(new RegExp(q+'の(\\d+)番目の(?:後|あと|うしろ)に'),(_: string,n: string)=>name.name+'の'+(Number(n)+1)+'番目に'));
    add(text.replace(new RegExp(q+'の(?:さいご|最後|最後のもの|おわり)'),() => (name.name+'の（'+name.name+'の数）番目')).replace(new RegExp(q+'の(?:先頭|最初|はじめ)'),() => (name.name+'の1番目')));
  }
  for(const name of data.names.filter(n=>n.kind==='sound')){const q=name.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');if(new RegExp('^「?'+q+'」?を(?:かける|かけて|かけます)$').test(text))add('「'+name.name+'」を鳴らす。');}
  if((m=/^画面の(左下|右下|左上|右上)(?:のはし|のすみ|の角)?(?:へ|に)(?:行く|もどる|動く|移動する)$/.exec(text)))add('画面の左下のはしから、右へ'+(m[1].includes('右')?(project.stage.width||640):0)+'歩、上へ'+(m[1].includes('上')?(project.stage.height||400):0)+'歩のばしょへ行く。');
  if(/^(?:はじめ|最初|さいしょ|もと|元)(?:の)?ばしょ(?:へ|に)(?:もどる|戻る|行く)$/.test(text)){const owner=project.components.find(c=>c.id===ctx.targetId);if(owner)add('画面の左下のはしから、右へ'+owner.x+'歩、上へ'+owner.y+'歩のばしょへ行く。');}
  if(/^(?:自分|自分だけ)(?:を|の動きを)?(?:全部|だけ)?(?:止める|止まる|とめる|とまる)$/.test(text))add('自分のほかの動きを止める。\nこの動きを止める。');
  add(text.replace(/([^、。]+?)(?:を|へ|が|で)(ふれ(?:た|る|て|ている|たら))/g,(s: string,name: string,verb: string)=>data.names.some(n=>n.kind==='part'&&['「'+n.name+'」',n.name].includes(name))||name==='画面のはし'?name+'に'+verb:s));
  add(text.replace(/(として|をわたして)(?!、)/g,'$1、').replace(/のを(\d+)回くり返す/,'ことを$1回くり返す'));
  if(text.length<=60)add(text.replace(/([うくぐすつぬぶむる])(?:\s+|[.，．・；→])(?=.)/g,'$1。\n'));
  if(/なら|たら|あいだ|まで/.test(text))add(text.replace(/より上/g,'より大きい').replace(/より下/g,'より小さい').replace(/と等しい/g,'と同じ').replace(/さわ|くっつ|かさな|重な|あた/g,'ふれ').replace(/クリックされた|クリックした/g,'おされた'));
  for(const v of [...out])if(v.includes('、')&&/^(?:もし|.+(?:とき|たら|ごと|たび)|.+くり返す)/.test(v)){const at=v.indexOf('、');if(v.slice(at+1).trim())add(v.slice(0,at+1)+'\n  '+v.slice(at+1).trim());}
  return [...out];
}
// A near sentence is shown only when the body with it written at its place passes the work's check as the body did
// without it. What the check says of the body with the sentence there, and does not say with a sentence that does
// nothing there (何もしない。, or もし1が1と同じなら、 where a block is opened), keeps the sentence from being shown
// (自分の点数を1ふやす。 where the part has no 点数; 持ち物を言う。 for a list). Where another line of the body does not
// read, the body is checked as far as the near sentence, and the sentence is not shown when a sentence that does
// nothing lets the body be read further than it does (a sentence put where the opening of a block was written). Of a
// work the check cannot be made of, with the near sentence or with a sentence that does nothing, the check says
// nothing of the near sentence.
const ASSIST_NEUTRAL=['何もしない。','もし1が1と同じなら、'];
export function assistWorkCheck(project: Project,basis: string,context: AssistContext & { key?: string; ownerKey?: string },start: number,end: number,source: string): boolean {
  const ctx=assistVerificationContext({...context,symbols:context.symbols||buildSymbols(project)}),put=(text: string)=>basis.slice(0,start)+text+basis.slice(end);
  // (a body is read once)
  const reads=new Map<string, ReturnType<typeof parseSyntax> | null>(),read=(text: string)=>{if(!reads.has(text))try{reads.set(text,parseSyntax(text,ctx));}catch{reads.set(text,null);}return reads.get(text)??null;};
  const from=basis.slice(0,start).split('\n').length,to=from+source.split('\n').length-1,whole=put(source),parsed=read(whole);if(!parsed)return false;
  if(!parsed.ast){
    // (how many lines past the place the body reads: all of them when it reads)
    const next=parsed.syntaxDiagnostics[0],reach=(text: string)=>{const got=read(text);return !got?0:got.ast?Infinity:(got.syntaxDiagnostics[0]?.line??0)-from;};
    // (the sentence that does nothing is tried in place of the text and in place of its whole line: すがたをかくす written
    // for 消える in 星にふれたとき消える leaves a heading with its sentence on one line before another sentence)
    const head=start?basis.lastIndexOf('\n',start-1)+1:0,tail=basis.indexOf('\n',end),lead=/^[ \t　]*/.exec(basis.slice(head))?.[0]??'',line=(text: string)=>basis.slice(0,head)+lead+text+(tail<0?'':basis.slice(tail));
    if(next&&next.line>to&&ASSIST_NEUTRAL.some(neutral=>Math.max(reach(put(neutral)),reach(line(neutral)))>next.line-to))return false;
  }
  // The body as far as the line, with a sentence that does nothing in a block the line leaves open.
  const upTo=(text: string,last: number)=>{const lines=text.split('\n').slice(0,last),closed=lines.join('\n');return [closed,closed+'\n'+(/^[ \t　]*/.exec(lines.at(-1)??'')?.[0]??'')+'  何もしない。'];};
  const said=(text: string,last: number): string[] | 'unchecked' | null=>{
    let got=read(text);for(const part of got?.ast?[]:upTo(text,last)){got=read(part);if(got?.ast)break;}if(!got?.ast)return null;
    // (a heading written in the body is checked with it: 「星」にふれたとき、 in the stage's body)
    const definition=typeof context.definition==='object'?context.definition:null,kind=context.definitionKind??null,targetId=kind?null:context.targetId??'stage',headings: Diagnostic[]=[];
    try{
      documentSyntaxItems(got.ast,'script:near',{ownerId:targetId??'stage',targetId,targetType:kind?null:context.targetType??'stage',event:kind?null:context.event??'start',args:context.args??[],definition,definitionKind:kind},project,headings);
      return [...headings,...analyzeAst(got.ast,project,{...context,definition})].map(e=>e.code+'\n'+e.message);
    }catch{return 'unchecked';}
  };
  const now=said(whole,to);if(!now)return false;if(now==='unchecked')return ASSIST_NEUTRAL.some(neutral=>said(put(neutral),from)==='unchecked');if(!now.length)return true;
  // (what the check says with either sentence that does nothing there is said of the body, not of the near sentence)
  for(const neutral of ASSIST_NEUTRAL){const without=said(put(neutral),from);if(Array.isArray(without))for(const e of without){const at=now.indexOf(e);if(at>=0)now.splice(at,1);}}
  return !now.length;
}
// Where a sentence is written with a condition, with 、 after it or not: just after 〜たら, 〜なら, 〜ば, 〜とき, 〜と,
// 〜まで and 〜あいだ (星にさわったら消える, 点数が10より大きければ止まる, 点数が10のとき止まる, 星にふれると消える,
// 星にふれるまで右に動く, 点数が10より小さいあいだ点数を1ふやす). What is in 「 」 or 【 】 and the names of the work are not
// words of the sentence; nor are the words that only hold the same letters (ベルをならす, あたらしい, たとえば, かくればしょ,
// くるくると回る), nor is the end of something done (鳴らしおわるまで待つ).
const ASSIST_CONDITION_WORDS=/たら|だら|なら|[えけげせてねべめれ]ば|(?<=[ただるいうくぐすつぬぶむの])(?:とき|時(?![間計刻点々]))|(?<=[うくぐすつぬぶむる])(?:と(?!言|い[うっいえわ]|話|はな[すしせそ]|たず|聞|き[くいかけこ]|思|おも|同じ|おなじ|ちが|比べ|くらべ|いっしょ|一緒|す[るれ]|し[たてよ]|[かもはのがをにでと]|、?。?$)|まで)|(?<=[るたい])(?:あいだ|間)/g;
const ASSIST_NOT_CONDITION=/あたらし|はたら[かきくけこい]|でたらめ|だらだら|だらけ|(?<=を)たら[すし]|(?<=を(?:[0-9０-９.．]+(?:秒|びょう|回|かい))?)なら[すしせそうっい]|(?<=[をにで])なら[べぶんび]|にならな|かならず|さよう?なら|たとえば|ばしょ|ばかり|ばん|ばい|ときどき|いつまで|(?:おわる|終わる|おえる|終える)まで|(?:秒|びょう)(?:間|かん)?(?:たつまで|たったら|たつと|すぎたら|すぎるまで|すぎると)|[そこあど]のとき|おとうと|いもうと|^すると|([ぁ-ん]{2})\1と/g;
function assistConditionEnds(text: string,project: Project) {
  const blank=(s: string)=>'＿'.repeat(s.length),names=[...project.components,...project.sounds,...project.actions,...project.functions,...[project.projectData,...project.components.map(c=>c.localData)].flatMap(data=>[...data?.variables||[],...data?.lists||[]])].map(n=>n.name).filter(Boolean).sort((a,b)=>b.length-a.length);
  let masked=text.replace(/「[^「」]*」|『[^『』]*』|【[^【】]*】/g,(s: string)=>blank(s));
  for(const name of names)masked=masked.split(name).join(blank(name));
  return [...masked.replace(ASSIST_NOT_CONDITION,(s: string)=>blank(s)).matchAll(ASSIST_CONDITION_WORDS)].map(m=>m.index+m[0].length);
}
// (a sentence that holds a condition: もし〜なら, 〜まで待つ, 〜あいだ、くり返す, 〜とき、 at the head of a body, and
// 画面のはしにふれていれば、はね返る where the edge or the bounce is written; a near sentence written with a condition
// word keeps it too: 全部終わるまで待つ)
// A heading keeps the condition written only where that condition is the event itself (スタートしたとき, 始まったら: what is
// before とき or たら reads as no condition of its own) or where the heading waits for what was written (the key, the
// signal, the part: 「スペース」キーをおすたびに, 「星」にふれたとき); 点数が10のとき is not kept by 作品を動かしたとき.
const assistConditionRead=(written: string,project: Project,ctx: AssistContext)=>assistConditionEnds(written,project).some(end=>{
  const upTo=written.slice(0,end).replace(/^もし/,''),before=upTo.replace(/の?(?:とき|時)$|(?:たら|だら|なら|と|まで|あいだ|間)$/,'');
  // (a sentence that does not read is no condition read, nor one that reads names the work does not have as variables,
  // ねこがタップされた or 合図が来た; the callbacks run at the reading just made)
  const own=project.components.find(c=>c.id===ctx.targetId)?.localData,known=new Set([...[project.projectData,own].flatMap(d=>[...d?.variables||[],...d?.lists||[]]).map(n=>n.name),...(ctx.args||[]),...(ctx.localNames||[])]);
  return ['もし'+upTo+'、\n  何もしない。','もし'+before+(/た$/.test(before)?'ら':'なら')+'、\n  何もしない。'].some(source=>{try{const condition=(parseSyntax(source,ctx).ast?.body?.[0] as {condition?: unknown}|undefined)?.condition;if(!condition)return false;
    let unknown=false;JSON.stringify(condition,(key,value: unknown)=>{if(value&&typeof value==='object'&&['VariableRead','ListRead'].includes((value as {kind?: string}).kind||'')&&!known.has((value as {name?: string}).name||''))unknown=true;return value;});return !unknown;}catch{return false;}});
});
const assistHeadingWaits=(heading: {event?: unknown,filter?: Record<string,unknown>},written: string)=>!!heading.filter&&Object.values(heading.filter).every(v=>typeof v!=='string'||written.includes(v)||heading.event==='keyDown'&&/キー|きー/.test(written));
export const assistKeepsCondition=(ast: Script,written: string,worded: boolean,project: Project|null=null,ctx: AssistContext|null=null)=>{
  const headings: {event?: unknown,filter?: Record<string,unknown>}[]=[];
  const text=JSON.stringify(ast,(key,value: unknown)=>{if(key==='heading'&&value&&typeof value==='object')headings.push(value as {event?: unknown,filter?: Record<string,unknown>});return key==='sourceSpan'?undefined:value;});
  if(text.includes('"op":"BOUNCE"'))return /はし|端|かべ|壁|はね|跳ね/.test(written);
  const held=/"condition":\{|"kind":"(?:WaitUntil|RepeatWhile|RepeatUntil|ContinuousRule)"/.test(text);
  if(!held&&headings.length&&project&&ctx&&!headings.every(h=>assistHeadingWaits(h,written))&&assistConditionRead(written,project,ctx))return false;
  return worded||held||headings.length>0;
};
// What a sentence acts on, as written (合図, 合図 waited for, きょり), and what the tree of a sentence acting on it holds.
const ASSIST_OBJECT_WORDS: [RegExp,RegExp][]=[[/(?:合図|あいず).*(?:待|まつ|まって)/,/"kind":"(?:BroadcastAndWait|WaitBroadcastGroup)"/],[/合図|あいず/,/"kind":"(?:Broadcast|BroadcastAndWait|WaitBroadcastGroup)"|"event":"message"/],[/きょり|距離/,/"sensor":"DISTANCE_TO"/]];
const ASSIST_REPEAT_WORDS=/ごとに|毎秒|たびに|ずっと(?!待|ま[つちっ])/;
// A near sentence keeps what was written (LANGUAGE.md 読めない文の近い書き方): every variable and list written acted on (持ち物の, 点数を), a
// condition (〜まで動く is done again until then, not waited for and done once), a repetition in time (1秒ごとに, ずっと,
// 〜たびに), and the signal, the wait for it and the distance written. Where the look is written, it changes no variable or
// list that is not written (すがたをかえる is not 点数を0にする).
export function assistKeepsWritten(project: Project,written: string,text: string,ast: Script | null,ctx: AssistContext) {
  const tree=ast?JSON.stringify(ast,(key,value: unknown)=>key==='sourceSpan'?undefined:value):'',own=project.components.find(c=>c.id===ctx.targetId)?.localData;
  let plain=written.replace(/「[^「」]*」|『[^『』]*』|【[^【】]*】/g,(q: string)=>'＿'.repeat(q.length));const names: string[]=[];
  for(const name of [project.projectData,own].flatMap(d=>[...d?.variables||[],...d?.lists||[]]).map(n=>n.name).filter(Boolean).sort((a,b)=>b.length-a.length))
    if(plain.includes(name)){if(plain.includes(name+'の')||plain.includes(name+'を'))names.push(name);plain=plain.split(name).join('＿'.repeat(name.length));}
  if(!names.every(name=>text.includes(name)))return false;
  if(/すがた|コスチューム|はいけい|背景/.test(plain)&&ast&&assistNodes(ast.body).some(n=>ASSIST_DATA_KINDS.includes(n.kind)&&n.target?.name&&!written.includes(n.target.name)))return false;
  if(!ASSIST_OBJECT_WORDS.every(([word,kept])=>!word.test(plain)||kept.test(tree)))return false;
  if(ASSIST_REPEAT_WORDS.test(plain)&&!/"kind":"(?:Forever|RepeatCount|RepeatWhile|RepeatUntil|ContinuousRule|ForEach)"|"heading":\{/.test(tree))return false;
  const ends=assistConditionEnds(written,project);
  if((/^もし/.test(written)||ends.length)&&(!ast||!assistKeepsCondition(ast,written,assistConditionEnds(text,project).length>0,project,ctx)))return false;
  return true;
}
// Something done until then (星にふれるまで右に動く, not 〜まで待つ, 〜まで止まる or 〜まで alone).
const assistDoneUntil=(written: string,project: Project)=>assistConditionEnds(written,project).some(at=>written.slice(at-2,at)==='まで'&&/^、?\s*[^。\s]/.test(written.slice(at))&&!/^、?\s*(?:ずっと)?(?:待|ま[つちっ]|止ま|とま)/.test(written.slice(at)));
// Every near sentence is returned here: one that reads in the place it is offered, passes the work check there and keeps
// what was written (assistKeepsWritten). With none, nothing is offered.
export function assistCandidates(project: Project,basis: string,context: AssistContext & { key?: string; ownerKey?: string }={},diagnostic: Diagnostic | null=null): AssistCandidate[] {
  basis=String(basis).replace(/\r\n?/g,'\n');
  const ctx=assistVerificationContext({...context,symbols:context.symbols||buildSymbols(project)});
  // (something done until then is waited for and then done once only beside the sentence doing it again until then)
  const kept=(list: AssistCandidate[])=>{
    const rows=list.map(c=>{const sentence=c.sentence??c.text,ast=assistCanonical(sentence,ctx,basis.slice(0,c.start).trimEnd().split('\n').at(-1)||'')?.ast??null;return {c,sentence,ast,written:basis.slice(c.start,c.end),again:!!ast&&/"kind":"RepeatUntil"/.test(JSON.stringify(ast))};})
      .filter(r=>assistKeepsWritten(project,r.written,r.sentence,r.ast,ctx)&&assistWorkCheck(project,basis,context,r.c.start,r.c.end,r.c.source));
    return rows.filter(r=>r.again||!assistDoneUntil(r.written,project)||rows.some(o=>o.again)).map(r=>r.c);
  };
  const found=kept(assistCandidatesAsWritten(project,basis,context,diagnostic));if(found.length||context.meijin||cpLen(basis)>ASSIST_FULL_PARSE_CHARS)return found;
  let first=diagnostic;try{if(!first)first=parseSyntax(basis,context).syntaxDiagnostics[0];}catch{return [];}
  const range=first?.line&&!first.proposals?.length?assistSourceRange(basis,first,ctx):null;if(!range)return [];
  // A condition written without 、 after it (星にさわったら消える) is looked for as written with it (星にさわったら、消える):
  // the near sentences of that body are shown when they write over the 、 too.
  for(const offset of assistConditionEnds(range.text,project)){
    const at=range.start+offset;if(offset>=range.text.length||basis[at]==='、')continue;
    const made=kept(assistCandidatesAsWritten(project,basis.slice(0,at)+'、'+basis.slice(at),context,null).filter(c=>c.start<=at&&c.end>at).map(c=>({...c,end:c.end-1})));
    if(made.length)return made;
  }
  // A が written for を (「星」までのきょりが言う) is the sentence with を there when that reads and keeps what was written.
  const plain=range.text.replace(/「[^「」]*」|『[^『』]*』|【[^【】]*】/g,(q: string)=>'＿'.repeat(q.length));
  for(let at=plain.indexOf('が');at>=0;at=plain.indexOf('が',at+1)){
    const source=range.text.slice(0,at)+'を'+range.text.slice(at+1),canonical=assistCanonical(source,ctx),node=canonical?.ast.body?.[0];
    let reads=false;try{reads=!!parseSyntax(basis.slice(0,range.start)+source+basis.slice(range.end),context).ast;}catch{}
    if(!reads||!canonical||!node)continue;
    const made=kept([{assist:true,schemaId:syntaxSchema(node)?.id||node.kind,origin:'S2',label:source.replace(/。$/,''),text:canonical.text,source,start:range.start,end:range.end}]);
    if(made.length)return made;
  }
  return [];
}
function assistCandidatesAsWritten(project: Project,basis: string,context: AssistContext & { key?: string; ownerKey?: string }={},diagnostic: Diagnostic | null=null): AssistCandidate[] {
  basis=String(basis).replace(/\r\n?/g,'\n');const ctx=assistVerificationContext({...context,symbols:context.symbols||buildSymbols(project)});
  // (the body's characters, as LANGUAGE.md counts them: an emoji is one)
  if(context.meijin||cpLen(basis)>ASSIST_FULL_PARSE_CHARS)return [];
  let first=diagnostic;try{if(!first)first=parseSyntax(basis,context).syntaxDiagnostics[0];}catch{return [];}
  if(!first||!first.line||!['P201','P205','S317'].includes(first.code))return [];
  // (no diagnostic has choices now: its proposals hold them; a proposal tested to call a procedure has its name)
  const existing=first.proposals||(first as Diagnostic & { choices?: Proposal[] }).choices||[],range=assistSourceRange(basis,first,ctx);if(!range)return [];
  if(existing.length&&!existing.every(p=>/【([^】]+)】という(?:手順|てじゅん)を行う/.test(p.source)&&!range.text.includes(/【([^】]+)】/.exec(p.source)?.[1]!)))return [];
  const data=assistSeeds(range.text,ctx.symbols,ctx);if(!data.text||/^(?:※|\s*$)/.test(data.text)||!/(?:何|なに)も(?:しない|せず|ない|しなくてよい)$/.test(data.text)&&/(?:ません|ない|ず|[うくぐすつぬぶむる]な)$/.test(data.text))return [];
  if(data.headerEvent&&(ctx.definitionKind||ctx.targetId==='stage'||data.headerEvent!=='valueChanged'&&data.subject&&data.subject!==project.components.find(c=>c.id===ctx.targetId)?.name&&!['自分','体'].includes(data.subject)||data.headerEvent==='click'&&data.names.some(n=>n.kind==='part'&&project.components.some(c=>c.name===n.name&&c.id!==ctx.targetId))))return [];
  // The stage does not move, nor do the parts there: the sentences for the parts written together are looked for in the
  // body of one of them, and kept when they read in the stage's body.
  // (the parts listed are there: the callback runs at the check just made; a name tested to be quoted is there)
  if(data.subjects&&ctx.targetId==='stage'){const part=project.components.find(c=>data.subjects!.parts.includes(c.name));
    return part?assistCandidates(project,basis,{...context,targetId:part.id,targetType:part.type},null).filter(c=>!!parseSyntax(basis.slice(0,c.start)+c.source+basis.slice(c.end),context).ast&&assistWorkCheck(project,basis,context,c.start,c.end,c.source)):[];}
  if(/^(?:\d+(?:\.\d+)?秒ごとに|毎秒)、.+は$/.test(data.text)&&!new RegExp('、(?:自分|'+project.components.find(c=>c.id===ctx.targetId)?.name+')は$').test(data.text))return [];
  if(/^「([^「」]+)」が\d+回/.test(data.text)&&!project.components.some(c=>c.name===/^「([^「」]+)」/.exec(data.text)![1]))return [];
  if(/^もし/.test(data.text)&&/以上と|以下と/.test(data.text))return [];
  if(!ctx.signalNames){try{ctx.signalNames=collectSignalNames(compileProject(project));}catch{ctx.signalNames={sent:[],received:[]};}}
  const previous=basis.slice(0,range.start).trimEnd().split('\n').at(-1)||'',pool: AssistPoolEntry[]=[],add=(text: string,origin: string,layer: number,extra: AssistExtra={})=>{
    if(data.clauses.length>1&&/(?:たら|れば|なら|とき|あいだ|まで)$/.test(data.clauses[0].text)&&/、$/.test(String(text).trim())&&!data.clauses.slice(1).every(c=>[project.components.find(c=>c.id===ctx.targetId)?.name+'は','自分は'].includes(c.text)))return;
    const canonical=assistCanonical(text,ctx,previous);if(!canonical)return;
    const node=canonical.ast.body?.[0]||canonical.ast.rules?.[0],schemaId=extra.schemaId||(canonical.ast.heading?'Heading:'+canonical.ast.heading.event:node?syntaxSchema(node)?.id||node.kind:null);if(!schemaId)return;
    if(origin==='S2'&&/のところ(?:へ|に|まで)(?:走|はし|とぶ|動)/.test(data.text)&&node?.kind==='MotionCommand'&&node.op!=='GOTO_PART')return;
    if(schemaId==='Heading:touchStart'&&data.subject===project.components.find(c=>c.id===ctx.targetId)?.name&&canonical.ast.heading?.actorRef?.kind!=='named')return;
    if(data.clauses.length>1&&/あいだ$/.test(data.clauses[0].text)&&(canonical.ast.body?.length||0)<2&&![...(canonical.ast.body||[]),...(canonical.ast.rules||[])].some(n=>['ContinuousRule','IfStatement','RepeatWhile','RepeatUntil','RepeatCount'].includes(n.kind))&&!searchReading(canonical.text).startsWith(searchReading(data.clauses[0].text)))return;
    if(extra.fromDiagnosis&&!/(?:とき(?:は)?|たら|れば|なら|あいだ|まで)$/.test(data.clauses.at(-1)?.text||data.text)){
      // (the loop goes on while one of the bodies has sentences)
      let last: SentenceNode | undefined=canonical.ast.body?.at(-1)||node;while(last?.thenBody?.length||last?.body?.length)last=(last.thenBody?.length?last.thenBody:last.body!).at(-1);
      const lastSchema=last?syntaxSchema(last)?.id||last.kind:schemaId,terms=hintCandidates(project,ctx.targetId,{...ctx,source:basis,start:range.lineStart+range.indent,end:range.lineEnd}).filter(h=>hintSchemaId(h.id).replace(/:timed$/,'')===lastSchema).flatMap(h=>[h.text,...h.terms?.synonyms||[],...h.terms?.verbForms||[]]),main=assistSeeds(data.clauses.at(-1)?.text||data.text,ctx.symbols,ctx).seeds.filter(seed=>seed.text.length>=2&&/[うくぐすつぬぶむる]$/.test(seed.text));
      if(main.length&&!main.some(seed=>matchesSearch(terms.join(' '),seed.text)))return;
    }
    pool.push({text:canonical.text,schemaId,label:BLOCK_SCHEMA_BY_ID.get(schemaId)?.label||canonical.text,origin,layer,rank:0,filled:0,order:pool.length,start:range.start,end:range.end,ast:canonical.ast,...extra});
  };
  const want=assistMeaningFrames(data,project,ctx,range.text),composed=assistCompose(project,basis,range,ctx,data,!!want);
  for(const entry of [...assistStructuredTransforms(data.text,data,project,ctx,basis,range),...assistTransforms(data.text,data,project,ctx),...composed.sources]){
    const variant=typeof entry==='string'?entry:entry.text;
    const replacement=typeof entry==='object'&&entry.whole?variant:variant.replace(/\n/g,() => ('\n'+' '.repeat(range.indent)));
    const written=replacement.endsWith('。')&&basis[range.end]==='。'?replacement.slice(0,-1):replacement,changedEnd=range.start+written.length,delta=written.length-(range.end-range.start);
    let parsed: ReturnType<typeof parseSyntax>;try{parsed=parseSyntax(typeof entry==='object'&&entry.whole?replacement:basis.slice(0,range.start)+replacement+(replacement.endsWith('。')&&basis[range.end]==='。'?basis.slice(range.end+1):basis.slice(range.end)),ctx);}catch{continue;}
    const from=basis.slice(0,typeof entry==='object'&&entry.whole?0:range.start).split('\n').length,to=from+replacement.split('\n').length-1,next=parsed.syntaxDiagnostics[0],outside=next&&!['P208','F504'].includes(next.code)&&(next.line<from||next.line>to);
    if(parsed.ast||outside)add(variant,'S2',2,typeof entry==='string'?(/。\s+※/.test(variant)?{schemaId:'CommentLine'}:{}):{...(entry.schemaId?{schemaId:entry.schemaId}:{}),...(entry.description?{description:entry.description}:{}),...(entry.whole?{start:entry.start,end:entry.end}:{})});
    // (a proposal of the check has its place; one without it compares false and is put at the sentence)
    else for(const p of parsed.syntaxDiagnostics[0]?.proposals as (Proposal & { start: number; end: number })[] | undefined||[]){
      if(p.start>changedEnd||p.end<range.start)continue;
      const action=/【([^】]+)】という(?:手順|てじゅん)を行う/.exec(p.source);if(action&&!data.text.includes(action[1]))continue;
      const start=p.start<=range.start?p.start:p.start>=changedEnd?p.start-delta:range.start,end=p.end<=range.start?p.end:p.end>=changedEnd?p.end-delta:range.end;
      add(p.source,'S2',2,{label:p.label,start,end,fromDiagnosis:true});
    }
  }
  // Names of signals are read once by the same collector as the work-check notices.
  for(const entry of assistSignalTransforms(data.text,project,ctx,basis,range))add(entry.text,'S4',3,{schemaId:entry.schemaId,...(entry.description?{description:entry.description}:{}),...(entry.end!==undefined?{end:entry.end}:{})});
  const allSearched=assistSearch(project,basis,range,ctx,data),searched=composed.composed?allSearched.filter(h=>searchReading(h.text.split('\n')[0].replace(/。$/,''))===searchReading(data.text)):allSearched;
  const signalGroup=pool.some(p=>p.schemaId==='WaitBroadcastGroup');
  const signalHeading=pool.filter(p=>p.origin==='S4'&&p.schemaId==='Heading:message'),directedSignal=pool.some(p=>p.origin==='S4'&&p.schemaId==='Broadcast')&&!/と(?:言う|話す|いう)$/.test(data.text),ownStop=pool.some(p=>p.schemaId==='StopCommand:OWN_OTHERS'&&p.text.includes('\n')),otherStop=data.names.some(n=>n.kind==='part'&&project.components.some(c=>c.name===n.name&&c.id!==ctx.targetId))&&/止まる|止める|とまる|とめる/.test(data.text);
  pool.push(...searched.filter(h=>(!signalGroup||!['Broadcast','BroadcastAndWait'].includes(h.schemaId))&&(!signalHeading.length||h.schemaId!=='Heading:message'||signalHeading.some(p=>p.text===h.text))&&(!directedSignal||h.schemaId!=='Say')&&(!ownStop||h.schemaId!=='StopCommand:OWN_OTHERS')&&(!otherStop||!['StopCommand:THIS','StopCommand:OWN_OTHERS','SoundCommand:STOP_ALL'].includes(h.schemaId))).map(h=>({...h,start:range.start,end:range.end})));
  // Parts written together are kept only by the sentences for each of them (assistListedSplits).
  if(data.subjects)for(const [text,label]of assistListedSplits(data.subjects,project,ctx))add(text,'S2',2,{label,listed:true});
  pool.sort((a,b)=>assistCompare(a,b,ctx));
  if(data.subjects)pool.splice(0,pool.length,...pool.filter(p=>p.listed));
  // The meaning written (assistMeaningFrames): a candidate that says something else is not shown, one that keeps every
  // role comes before one that leaves a role out (which is shown only when none keeps them all), and one that names
  // the subject as written comes first. Each candidate that leaves out the subject or the time also comes made whole.
  const partNames=project.components.map(c=>c.name),partial: (AssistCandidate & { meaning?: AssistMeaning })[]=[];
  // A candidate made whole is kept only when it keeps more of the meaning than the one it was made from.
  const meaningOf=(text: string)=>{const canonical=assistCanonical(text,ctx,previous);return canonical?{text:canonical.text,meaning:assistMeaningMatch(want,assistAstFrames(canonical.ast,project,ctx))}:null;};
  if(want)for(let i=pool.length-1;i>=0;i--){const made=assistMeaningCompletions(pool[i].text,want,partNames);if(!made.length)continue;const from=meaningOf(pool[i].text)?.meaning;
    // (the filter keeps the candidates whose meaning is read)
    pool.splice(i,0,...(made.map(meaningOf).filter(c=>c?.meaning&&(!from||c.meaning.missing<from.missing||c.meaning.explicit&&!from.explicit)) as { text: string; meaning: AssistMeaning }[]).map(({text})=>({...pool[i],text,ast:null,label:pool[i].label===pool[i].text?text:pool[i].label})));}
  const now=()=>globalThis.performance?.now?.()??Date.now();
  const contextHints=hintCandidates(project,ctx.targetId,{...ctx,source:basis,start:range.lineStart+range.indent,end:range.lineEnd}),knownSchemas=new Set(contextHints.filter(h=>h.mode==='statement').map(h=>hintSchemaId(h.id).replace(/:timed$/,'')));
  const hasHigher=pool.some(p=>p.layer<6),seen=new Set(existing.map(p=>p.source.replace(/[\s。]/g,''))),out: (AssistCandidate & { meaning?: AssistMeaning })[]=[],started=now(),topic: { before?: ActorRef | null }={},familyNamed=Object.values(ASSIST_FAMILY_WORDS).some(w=>w.test(data.text.replace(/「[^「」]*」|『[^『』]*』/g,'')));let unread: string | null=null,nearest: Set<string> | null=null;
  const conditionWritten=/^もし/.test(data.text)||assistConditionEnds(range.text,project).length>0;
  for(const p of pool){if(p.layer===6&&hasHigher)continue;const key=p.text.replace(/[\s。]/g,'');if(key===range.text.replace(/[\s。]/g,'')||seen.has(key))continue;
    const canonical=assistCanonical(p.text,ctx,previous);if(!canonical)continue;
    const frames=assistAstFrames(canonical.ast,project,ctx),meaning=assistMeaningMatch(want,frames);if(!meaning)continue;
    // A sentence written with a condition (点数が3より大きいなら…, 点数が10になったら…, 星にさわったら消える) is not near
    // one without it: that one does something else (LANGUAGE 近い書き方 keeps the meaning written). A heading (「出発」が
    // 来たら → 合図を受けたとき) keeps it.
    if(conditionWritten&&!assistKeepsCondition(canonical.ast,range.text,assistConditionEnds(p.text,project).length>0,project,ctx))continue;
    if(assistListAllSaid(data)&&canonical.ast.body?.[0]?.kind!=='ForEach')continue;
    // Where no meaning was read and nothing asks for words, nothing that was not written is said, asked or sent
    // (ねこのすがたを見せる in ねこ's body is not 「やったね」と言う; 名前をたずねる still gets 「名前は？」とたずねて).
    if(!want&&!ASSIST_SAY_WORDS.test(range.text)&&frames?.some(f=>f.said.some(v=>v!==''&&!basis.includes(v))))continue;
    // With no action read (すがたを「丸」にかえた), a sentence that keeps only names in the work does the action of the
    // nearest sentence shown (not 点数を「丸」にする).
    if(meaning.nameOnly&&unread!==null&&meaning.actions!==unread)continue;
    // A part written as what is acted on (ねこをふやす) is not near a sentence of a variable not written (点数を1ふやす).
    // Where no meaning was read, a sound is played only when a sound is written, and with the sound, the pen or a move
    // written a variable not written is not changed (ペンを下げる is neither 音の高さを1段階下げる nor 点数を1へらす).
    if(!want&&!assistFamiliesWritten(canonical.ast,data,new Set([...Object.keys(ASSIST_FAMILY_WORDS).filter(k=>k!=='SoundCommand'),...familyNamed?[]:ASSIST_DATA_KINDS])))continue;
    // Where no meaning was read, the pen is put up or down, or its size set, only when the pen is written (体力を1あげる is
    // not ペンを上げる; 全部消す may still clear the lines).
    if(!want&&!ASSIST_FAMILY_WORDS.PenCommand.test(data.text.replace(/「[^「」]*」|『[^『』]*』/g,''))&&assistKindsOps(canonical.ast).some(k=>['PenCommand:UP','PenCommand:DOWN','PenCommand:SET_SIZE'].includes(k)))continue;
    // Where no meaning was read, the timer is set to 0 only when the timer or a time is written (線をかきはじめる is not タイマーを0にする).
    if(!want&&!/タイマー|たいまー|秒|びょう|時間|じかん/.test(data.text.replace(/「[^「」]*」|『[^『』]*』/g,''))&&assistKindsOps(canonical.ast).some(k=>k.startsWith('TimerReset')))continue;
    if(want&&(nearest?!assistFamiliesWritten(canonical.ast,data,nearest):want.some(f=>f.objects?.length)&&!assistFamiliesWritten(canonical.ast,data,new Set(),true)))continue;
    const allowed=p.allowedSchemas||new Set(hintCandidates(project,ctx.targetId,{...ctx,source:basis,start:range.lineStart+range.indent,end:range.lineEnd}).filter(h=>h.mode==='statement'&&h.enabled).map(h=>hintSchemaId(h.id)));
    const localNames=new Set([...(ctx.args||[]),...(ctx.localNames||[])]),knownFor=(actor: string | null | undefined)=>new Set([...(project.projectData?.variables||[]),...(project.projectData?.lists||[]),...(project.components.find(c=>c.id===actor)?.localData?.variables||[]),...(project.components.find(c=>c.id===actor)?.localData?.lists||[])].map(n=>n.name));
    // (a declaration names its local and a ForEach its binder; a member that is an object is a node or a list of them;
    // the callbacks run at the checks just made; a StringLiteral's value is text; a node of no sentence has no form)
    const gather=(node: AssistNode)=>{if(!node||typeof node!=='object')return;if(['LocalVariableDeclaration','LocalListDeclaration'].includes(node.kind))localNames.add(node.name!);if(node.kind==='ForEach')localNames.add(node.binder!);for(const [k,v]of Object.entries(node))if(k!=='sourceSpan'&&v&&typeof v==='object')Array.isArray(v)?(v as AssistNode[]).forEach(gather):gather(v as AssistNode);};gather(canonical.ast);
    let forbidden=false;const visit=(node: AssistNode | AssistNode[],actor: string | null | undefined=ctx.targetId)=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(n=>visit(n,actor));return;}if(node.actorRef?.kind==='named')actor=project.components.find(c=>c.name===node.actorRef!.name)?.id;else if(node.actorRef?.kind==='self')actor=ctx.targetId;const knownNames=knownFor(actor),form=sentenceFormFor(node as SentenceNode);if(form){const schema=syntaxSchema(node)?.id||node.kind;if(!form.allowedContexts.includes(ctx.definitionKind||'script')||(knownSchemas.has(schema)||ctx.definitionKind==='function')&&!allowed.has(schema))forbidden=true;}
      if(node.heading){const ref=node.heading.actorRef,owner=ref?.kind==='named'?project.components.find(c=>c.name===ref.name):project.components.find(c=>c.id===ctx.targetId);if(!owner||!EVENT_BY_TYPE[owner.type]?.includes(node.heading.event))forbidden=true;}
      if(['VariableRead','ListRead'].includes(node.kind)&&!knownNames.has(node.name)&&!localNames.has(node.name))forbidden=true;
      if(['Assignment','NumericUpdate','ListAppend','ListInsert','ListReplace','ListDelete','ListClear'].includes(node.kind)&&node.target?.name&&!knownNames.has(node.target.name)&&!localNames.has(node.target.name))forbidden=true;
      if(node.kind==='UserActionCall'&&!project.actions.some(a=>a.name===node.name))forbidden=true;
      if(node.kind==='UserFunctionCall'&&!project.functions.some(a=>a.name===node.name))forbidden=true;
      if(node.actorRef?.kind==='named'&&!project.components.some(c=>c.name===node.actorRef!.name))forbidden=true;
      if(node.kind==='MotionCommand'&&['GOTO_PART','POINT_TO'].includes(node.op)&&node.args?.[0]?.kind==='StringLiteral'&&!project.components.some(c=>c.name===node.args![0]!.value)&&node.args[0].value!=='マウス')forbidden=true;
      if(node.kind==='SoundCommand'&&['SAMPLE','SAMPLE_WAIT'].includes(node.op)&&node.args?.[0]?.kind==='StringLiteral'&&!project.sounds.some(c=>c.name===node.args![0]!.value))forbidden=true;
      if(node.kind==='LooksCommand'&&node.op==='SET_COSTUME'&&node.args?.[0]?.kind==='StringLiteral'&&!project.components.find(c=>c.id===actor)?.costumes?.some(c=>c.name===node.args![0]!.value))forbidden=true;
      if(node.kind==='LooksCommand'&&node.op==='SET_COLOR'&&node.args?.[0]?.kind==='StringLiteral')try{resolveColor(node.args[0].value as string);}catch{forbidden=true;}
      for(const [k,v]of Object.entries(node))if(k!=='sourceSpan'&&v&&typeof v==='object')visit(v as AssistNode,actor);};visit(canonical.ast);
    if(p.schemaId?.startsWith('Heading:'))forbidden=forbidden||!!ctx.definitionKind||ctx.targetId==='stage';if(forbidden)continue;
    const start=p.start??range.start,written=(p.text.endsWith('。')&&basis[p.end??range.end]==='。'?p.text.slice(0,-1):p.text).replace(/\n/g,() => ('\n'+' '.repeat(range.indent)));
    // The next sentence keeps who does it: one the near sentence's subject would carry on to is given its own. The button
    // shows what is written (LANGUAGE.md 読めない文の近い書き方): that next line is shown and written with it, as the code
    // writes it; where it cannot be written so, the near sentence is not shown.
    const kept=assistNextSubject(basis,start,p.end??range.end,written,range.indent,ctx,project,topic),end=kept?(basis+'\n').indexOf('\n',kept.at):p.end??range.end;
    const shown=kept&&assistCanonical((written+kept.between+basis.slice(kept.at,end)).replace(new RegExp('\\n[ \\t]{0,'+range.indent+'}','g'),'\n'),ctx,previous);if(kept&&!shown)continue;
    const text=shown?shown.text:p.text,source=shown?text.replace(/\n/g,()=>'\n'+' '.repeat(range.indent)):written,replacement=basis.slice(0,start)+source+basis.slice(end);let valid=false;
    const following=basis.slice(end).split('\n').slice(1).find(line=>line.trim()&&line.match(/^\s*/)![0].length<=range.indent);if(following&&/^そうでなければ、/.test(following.trim())&&canonical.ast.body?.[0]?.kind!=='IfStatement')continue;
    try{const parsed=parseSyntax(replacement,ctx),next=parsed.syntaxDiagnostics[0],from=basis.slice(0,start).split('\n').length,to=from+source.split('\n').length-1;valid=!!parsed.ast||next&&!['P208','F504'].includes(next.code)&&(next.line<from||next.line>to||next.code==='P202'&&next.line===from);}catch{}
    valid=valid&&assistWorkCheck(project,basis,context,start,end,source);
    if(valid){const label=(p.label||BLOCK_SCHEMA_BY_ID.get(p.schemaId)?.label||p.text).replace(/いまのばしょから/g,'いまの ばしょから').replace(/決めたばしょへ/g,'決めた ばしょへ').replace(/始まったことが/g,'始まった ことが');seen.add(key);if(meaning.actions!==undefined)unread??=meaning.actions;nearest??=assistKinds(canonical.ast);(meaning.missing?partial:out).push({assist:true,schemaId:p.schemaId,origin:p.origin,label,text,...(shown?{sentence:p.text}:{}),source,start,end,...(p.description||kept?{description:[p.description,kept?.note].filter(Boolean).join(' ')}:{}),...(want?{meaning}:{})});}
    // As many candidates are looked at as are shown: one that leaves a role out still takes its place, so the ones
    // further down (less near to what was written) are not reached to fill the places it leaves.
    const taken=out.length+partial.length;if(taken>=ASSIST_MAX||!hasHigher&&taken>=2||now()-started>ASSIST_BUDGET_MS)break;
  }
  if(!want)return out;
  // (with a meaning read, every candidate has its match)
  const shown=(out.length?[...out.filter(c=>c.meaning!.explicit),...out.filter(c=>!c.meaning!.explicit)]:partial.sort((a,b)=>a.meaning!.missing-b.meaning!.missing)).slice(0,hasHigher?ASSIST_MAX:2);
  // The stage does not move: a sentence that names the part that does it (ねこを…移動させる, ねこのすがたを…) is looked
  // for in that part's body; a near sentence of one line there gets the part's name (すがたを見せる → ねこはすがたを見せる),
  // and is kept when every line names the part and it reads in the stage's body too. The lines are those of the near
  // sentence (sentence), not the next sentence shown after it with its own subject.
  if(!shown.length&&ctx.targetId==='stage'&&want?.length&&want.every(w=>w.subject&&w.subject===want[0].subject)){
    const part=project.components.find(c=>c.name===want[0].subject),named=part&&sentenceActorSource({kind:'named',name:part.name})+'は',seenText=new Set<string>();
    if(part)return assistCandidates(project,basis,{...context,targetId:part.id,targetType:part.type},null)
      // (named is written for the part)
      .map(c=>c.text.includes('\n')||c.text.startsWith(named!)?c:{...c,text:named+c.text,source:named+c.source,label:c.label===c.text?named+c.text:c.label})
      .filter(c=>{const sentence=c.sentence??c.text;if(seenText.has(sentence))return false;seenText.add(sentence);try{return sentence.split('\n').every(line=>line.startsWith(named!))&&!!parseSyntax(basis.slice(0,c.start)+c.source+basis.slice(c.end),context).ast&&assistWorkCheck(project,basis,context,c.start,c.end,c.source);}catch{return false;}});
  }
  return shown.map(({meaning,...candidate})=>candidate);
}
export function blockPaletteSearchText(schema: Pick<BlockSchema, 'label' | 'id' | 'kind' | 'palette'>) {
  const words = [schema.label, schema.id, schema.kind, schema.palette,
    ...((BLOCK_SEARCH_SYNONYMS[schema.id] || BLOCK_SEARCH_SYNONYMS[schema.kind]) || [])];
  const operation = schema.id.includes(':') ? schema.id.slice(schema.id.indexOf(':') + 1) : null;
  for (const form of SENTENCE_FORMS) {
    if (form.kind !== schema.kind || (form.op && operation && form.op !== operation)) continue;
    // The move verbs and the verbs of ふやす・へらす are shared by blocks of other meanings: their own search words say them.
    words.push(form.intent, ...(['MotionCommand', 'NumericUpdate'].includes(schema.kind)?[]:form.verbForms || []), ...(form.nounForms || []).filter(word=>word!=='動く対象'),
      ...(form.acceptedReadings || []));
  }
  return words.filter(Boolean).join(' ').toLocaleLowerCase();
}

// Keep the initial prefix and explicitly revealed distant pages together.
// A focus jump must not materialize every intervening statement.
export function blockBodyRanges(length: number, prefixPage: number, extraPages: Iterable<number> | null | undefined, pageSize = 60) {
  const ranges = [[0, Math.min(length, (prefixPage + 1) * pageSize)]];
  for (const page of extraPages || [])
    if (Number.isInteger(page) && page >= 0 && page * pageSize < length)
      ranges.push([page * pageSize, Math.min(length, (page + 1) * pageSize)]);
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: number[][] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

