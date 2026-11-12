// What reading a source works with (02-language-contracts.ts to 07-semantic-analysis.ts): its lines, the places of
// their characters, and where the text being read is. Types only; the product holds none of this.
import type { SourceContext, Symbols } from './compiled.d.ts';
import type { readNameToken } from '../ts/03-default-assets.ts';
import type { Expression, Rule, Script, Statement, Target } from './syntax.d.ts';
import type { ActorRef, Heading, PartPickRule, Readable, ScriptUnit, Unit } from './syntax-base.d.ts';

// The code of a line without its blanks, and where each of its characters is in the source (a character the reader
// wrote in, as なら for のとき or a 名人 sentence written again, has none).
export interface MappedText { text: string; positions: (number | undefined)[] }
// A line of a source (normalizeSource): as written, its code without the comment, and where it is. A 「 」 that goes on
// over lines makes one line of them; the lines after it are continuations.
export interface SourceLine {
  raw: string; start: number; end: number; lineNo: number; code: string; comment: string; mapped: MappedText;
  endLine?: number; continuation?: boolean; indent?: number; startColumn?: number; endColumn?: number;
  // A sentence read from part of a line (inline), or a line the reader wrote again (rewritten; a 名人 rewrite, how many
  // times, and whether the 名人 text owns its subject); where the physical line starts, and the columns of its text.
  inline?: boolean; rewritten?: boolean; meijinRewrites?: number; meijinOwned?: boolean; physicalStart?: number; sourceColumns?: SurfaceColumns;
}
// The columns of a line as written (surfaceLineInfo): for each UTF-16 place the number of characters before it on its
// physical line, and how many line breaks (in a 「 」 that goes on over lines) come before it.
export interface SurfaceColumns { raw: string; values: Uint32Array; count: number; rows?: Uint32Array }
// A line as a sentence is made from it: a line of the source, or a text read on its own (its text and line number).
export type LineLike = Partial<SourceLine> & { lineNo: number; raw: string; code: string };
// A line with the places of its characters: a line of the source, or a part of one made a line (surfaceLineSlice).
export type MappedLine = LineLike & { mapped: MappedText };
// A part of a line made a line of its own (surfaceLineSlice): its code, where its characters are and its columns.
export type LineSlice = LineLike & { mapped: MappedText; sourceColumns: SurfaceColumns; startColumn: number };
// A line of a script as the block reader takes it (parseScriptUnit): a line of the source, or a sentence of one, with its indent.
export type IndentedLine = SourceLine & { indent: number };
// A part of a code taken by a pattern (surfaceCapture): its text, and where it starts and ends in the code.
export interface SourcePart { text: string; start: number; end: number }
// Where a range of the source is (sourceRange): the first character and the one after the last.
export interface SourceRangeOf { start: number; end: number }
// Where a node read from a source is (SOURCE_RANGES): the whole of it, and the part's name it names.
// A sentence also has where its text is with its indent (extent, indent), and whether it was read from part of a
// line or written again by the reader.
export type SourceRanges = {
  range?: SourceRangeOf | null; actorRange?: SourceRangeOf | null;
  // A condition: the form it was written in.
  conditionForm?: ConditionForm;
  inline?: boolean; rewritten?: boolean;
  // A block with its body on its own line (inlineContainer), where a ForEach's binder is written or would be written,
  // and a heading's touch target.
  inlineContainer?: boolean; binderRange?: SourceRangeOf | null; binderInsert?: { at: number; indent: number }; targetRange?: SourceRangeOf | null;
} & ({ extent: SourceRangeOf; indent: number } | { extent?: undefined; indent?: undefined });
// A sentence's ranges: it has where its text is with its indent.
export type SentenceRanges = SourceRanges & { extent: SourceRangeOf; indent: number };
// Where the text being read is, and what it may use: the source it belongs to (whose, when it starts, a made block),
// the names made in it so far, the subject of its sentences, and the line and the places of its characters.
// (definition: the made block, or true when only its being a made block is known)
export type ParseContext = Omit<Partial<SourceContext>, 'definition'> & {
  definition?: SourceContext['definition'] | boolean;
  symbols?: Symbols | null;
  lineNo?: number; sourceLine?: LineLike; sourcePositions?: (number | null | undefined)[];
  // The names made in the text (この中だけ, 今見ているもの), its own variables, and the arguments of the made block.
  localNames?: string[]; localVarNames?: string[]; localListNames?: string[]; binders?: string[];
  // The subject of the sentences (a heading that names a part), and the one a sentence wrote before itself.
  topicActor?: ActorRef; sentenceActor?: ActorRef | null; explicitControlActor?: boolean; topicSet?: boolean;
  previousHeading?: Heading | null;
  // How the text is read: a condition as a sentence says it, a sentence read again in another form, how deep the
  // expressions and the 名人 procedures nest.
  naturalCondition?: boolean; naturalVariant?: boolean; _parserDepth?: number; meijinDepth?: number;
  // Where each character of a part of a value is in the whole value, for a reader of that part (its mistakes are told
  // at their places in the value when the places in the line are not known).
  _valuePositions?: (number | null | undefined)[];
  // 名人: a reading tried only to see whether the line reads (no guidance is looked for inside it).
  meijinProbe?: boolean;
  // 名人: the subject each line of a 並び starts from.
  laneTopic?: ActorRef;
};

// How a condition is written: as it is, after もし (if), のあいだ (while), まで (until), or joined by で／て (and).
export type ConditionForm = 'plain' | 'if' | 'while' | 'until' | 'and';
// A part a sentence form says (sentenceRoleSlots): where it is in the node, its name for the child, what it is, its unit.
export interface RoleSlot {
  readonly path: string; readonly label: string;
  readonly type: 'target' | 'condition' | 'arguments' | 'expression' | 'actor' | 'name' | 'reference' | 'direction';
  readonly unit: Unit | null; readonly required: boolean;
}
// A sentence or a rule, as a sentence form writes it.
export type SentenceNode = Readable<Statement | Rule>;
// A sentence form (SENTENCE_FORMS): the pattern it is read with, the node it makes, the words it is found by, where it
// may be written, and how its node is written back. An extension's command has a form of its own (sentenceFormFor).
export interface SentenceForm {
  readonly id: string; readonly pattern: RegExp | null; readonly kind: string; readonly op?: string | null; readonly role?: string | null;
  readonly intent: string; readonly semanticOperation: string; readonly roleSlots: readonly RoleSlot[];
  readonly clauses: readonly { readonly role: string; readonly label: string; readonly unit: Unit | null }[];
  readonly verbForms: readonly string[]; readonly nounForms: readonly string[]; readonly acceptedReadings: readonly string[];
  readonly evaluationOrder: readonly string[]; readonly allowedContexts: readonly string[]; readonly errors: readonly string[];
  render(node: SentenceNode): string; preview(node: SentenceNode): string;
}
export interface ExtensionSentenceForm {
  kind: 'ExtensionCommand'; allowedContexts: string[]; roleSlots: RoleSlot[];
  // (found only for an ExtensionCommand: it reads the node as one)
  render(node: SentenceNode): string; preview(node: SentenceNode): string;
}

// The patterns made of a work's part names (actorNamePatterns, 04-syntax-sentences.ts), longest name first: the
// names, the parts and the stage with 自分, and the subjects of two parts together, inside a heading, of a wait at
// the end, and of だけ.
export interface ActorNamePatterns {
  partNames: string[]; partsWithSelf: { name: string }[]; actorsWithSelf: { name: string }[];
  both: RegExp; inner: RegExp; late: RegExp; only: RegExp;
}

// A mistake of a list's どれか (P205), with the value written out for the sentence to be rewritten with.
export interface ListPickError { message: string; listPick: string }

// Reading a move sentence (04-syntax-sentences.ts): a value with its unit read from the text at its place, one leg (its
// axis, its direction and its steps), the legs of a move, and how a place move is made from them.
export type QuantityReader = (text: string, unit: Unit, start: number) => Expression;
export interface MoveLeg { axis: 'x' | 'y'; dir: 'right' | 'left' | 'up' | 'down'; amount: Expression }
export type MoveLegs = { x?: Pick<MoveLeg, 'amount'> & Partial<MoveLeg>; y?: Pick<MoveLeg, 'amount'> & Partial<MoveLeg> };
export type PlaceMoveBuild = (op: 'GOTO' | 'MOVE_BY', legs: MoveLegs, seconds: Expression | null, originOnly: boolean) => Statement;

// A heading as read (readSentenceHeading): its event and subject, the body written after it on the same line, the
// part written as its subject, a touch's target as written, and the subject a 名人 body starts with.
export interface HeadingRead {
  heading: Heading; body: SourcePart; actor?: SourcePart | null; target?: { start: number; end: number }; bodyTopic?: ActorRef;
}

// The head of a block written in a line (readBlockHead): its kind, its condition, count, list or binder, the body
// written after it in the same line, and its subject when the line names one.
export type BlockHead = Readable<(
  | { kind: 'Else' } | { kind: 'IfStatement'; condition: Expression } | { kind: 'RepeatCount'; count: Expression } | { kind: 'Forever' }
  | { kind: 'RepeatWhile' | 'RepeatUntil'; condition: Expression } | { kind: 'ForEach'; list: Expression; binder: string }
) & { inlineBody?: Statement[]; actorRef?: ActorRef }>;
// What a block is read with (parseScriptUnit): the subject its sentences have.
export type BlockScope = ParseContext & { topicActor: ActorRef };
// The members of a block's node as the block reader makes them from its head: its subject, its bodies, whether a もし has
// そうでなければ and that line's comment, and the last line of the block.
export type BlockFields = Omit<Partial<BlockHead>, 'actorRef'> & {
  actorRef: ActorRef; thenBody?: Statement[]; elseBody?: Statement[]; hasElse?: boolean; elseComment?: string; binderComment?: string; body?: Statement[]; endLine?: number;
};

// What the block reader walks after reading a script (parseScriptUnit): every value with a kind below its sentences (a
// node, a subject, or the rule of a 名人 pick).
export type WalkedNode = Readable<Statement | Rule | Expression | Target | ActorRef | PartPickRule>;
// A node of a whole tree as a walk reads it: the script and its units too.
export type TreeNode = Readable<Script | ScriptUnit | Statement | Rule | Expression | Target | ActorRef | PartPickRule>;

// The parts of a sentence the diagnosis reads (diagnoseSentenceIntent): the parts one of its patterns takes (a tuple
// where a group may be left out), or a match of exec.
export type DiagnosisParts = SourcePart[] | RegExpExecArray
  | [SourcePart, SourcePart, SourcePart | null] | [SourcePart, SourcePart | null, SourcePart] | [SourcePart | null, SourcePart, SourcePart]
  | [SourcePart, SourcePart | null, SourcePart | null, SourcePart] | [SourcePart, SourcePart | null, SourcePart, SourcePart | null, SourcePart]
  | [SourcePart, SourcePart, SourcePart | null, SourcePart | null, SourcePart | null];
// A sentence of a 〜して、 chain the diagnosis reads (diagnoseSentenceIntent): where it is, and the て-form it ends with
// and its plain form (the last sentence has none).
export type TeClause = { start: number; end: number; pair: readonly [string, string] | null };
// The expression reader (ExpressionParser, 04-syntax-expressions.ts) as the 名人 readers use it: the text, where the
// reader is, the work's names and where the text is, and how it reads a word at its place, a suffix at the top level
// and a plain value.
export interface MeijinExpressionReader {
  text: string; i: number; symbols: Symbols | null | undefined; ctx: ParseContext;
  starts(s: string): boolean; findTopSuffix(suffixes: readonly string[]): { pos: number; suffix: string } | null; basic(): Expression;
  // Whether the の at i starts a list read of the value before it, and whether a name is surely no list.
  startsListRead(list: boolean): boolean; nameKnownNotList(name: string): boolean;
}
// A name read at a place of a text (readNameToken): the name, where it ends, and whether it was written in 【 】.
export type NameToken = NonNullable<ReturnType<typeof readNameToken>>;
// A subject of a 名人 sentence (meijinSubject): several parts at once, every part of a set (or none), a list of parts,
// or one part held in a variable.
export type MeijinSubject = Readable<{ lanes: string[] } | { set: Expression } | { list: Expression } | { value: Expression }>;
// What a 名人 line is read with (readMeijinLine): the work's names, the scope of the line, the block reader's lines and
// where the line is among them (top: in the outermost body), how the next line with code is found, and how the lines
// under it are read (null for a line read on its own, readMeijinSentence).
export interface MeijinLineEnv {
  symbols: Symbols | null | undefined; scope: ParseContext; lines: readonly LineLike[]; top: boolean; index: number; indent: number;
  nextCode(i: number): number; children: ((at: number, childScope: ParseContext) => { nodes: Statement[]; index: number }) | null;
}
// A 名人 line as read: its sentences and the index of the line after them, or the line written again as a common sentence.
export type MeijinLineRead<L extends LineLike> = Readable<{ nodes: Statement[]; index: number } | { rewrite: L & LineSlice }>;
// The parts of a 名人 line its patterns take (readMeijinLine): a tuple where a group may be left out.
export type MeijinLineParts = SourcePart[] | [SourcePart, SourcePart | null] | [SourcePart, SourcePart, SourcePart | null]
  | [SourcePart | null, SourcePart, SourcePart, SourcePart] | [SourcePart | null, SourcePart, SourcePart | null, SourcePart | null, SourcePart | null];
