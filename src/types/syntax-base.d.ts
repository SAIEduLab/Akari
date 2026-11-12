// The parts of the syntax tree the block schemas do not describe; syntax.d.ts (made from the schemas) holds the rest.
// Types only; the product holds none of this.
import type { Unit } from '../../extensions/types.d.ts';
import type { EventFilter, EventName } from './project.d.ts';
import type { CompareExpression, Expression, Rule, SensorRead, Statement, TargetReference } from './syntax.d.ts';
export type { Unit };

// Where a node is written: lines and columns from 1, the end column after the last character.
export interface SourceSpan { startLine: number; startColumn: number; endLine: number; endColumn: number }
// Who a sentence is for: the part the script belongs to (topicEnded: a 名人 sentence that ended the topic before it),
// a part by its name, every part, or the part a value names (名人).
// particle: the が the subject was written with (how it is written, not what it does; a subject written with は has
// none); targetId: the part it was resolved to, when that is known.
// (each form readable for the others' members: Readable, below)
// mustName: inside 〜が〜にふれたとき, a 名人 sentence must name which of the two parts it is about (touch).
export type ActorRef = Readable<{ kind: 'self'; topicEnded?: boolean; mustName?: 'touch' } | { kind: 'named'; name: string; particle?: string; targetId?: string } | { kind: 'all' } | { kind: 'value'; value: Expression }>;
// Where a name is read: as it resolves (null), exactly as written, the part's own, the work's.
export type Qualifier = null | 'exact' | 'self' | 'project';
// A union whose forms can each be read for the members of the others: each form has them as never (they read
// undefined), as the forms of Heading and EventFilter do. A form is still told apart by its kind (and op, name...).
type KeysOf<U> = U extends unknown ? keyof U : never;
export type Readable<U, All = U> = U extends unknown ? U & { [K in Exclude<KeysOf<All>, keyof U>]?: never } : never;
// What every node may have: where it is written (a node made from blocks, or by the editor, has none).
export type NodeBase = { sourceSpan?: SourceSpan };
// A sentence also has: the last line of its body (a sentence with a body), the text of a comment line as written, and
// who it is for (a sentence that names no subject has none).
// (speaksAs: who speaks in a 名人 list sentence made from 〜がそれぞれ言う)
export type StatementBase = NodeBase & { endLine?: number; raw?: string; actorRef?: ActorRef; speaksAs?: ActorRef };

// When a script starts (EVENT_BY_TYPE, MEIJIN_EVENTS); a filter narrows the event to one key, message or part.
// Each form has the parts of the others as never, so any part can be read (undefined).
type Only<T> = T & { [P in Exclude<'filter' | 'condition' | 'seconds', keyof T>]?: never };
export type Heading =
  | Only<{ event: 'start' | 'click' | 'backdropChanged' | 'valueChanged' | 'cloneStart'; actorRef: ActorRef }>
  | Only<{ event: 'keyDown'; actorRef: ActorRef; filter?: Extract<EventFilter, { key: string }> }>
  | Only<{ event: 'message'; actorRef: ActorRef; filter?: Extract<EventFilter, { message: string }> }>
  | Only<{ event: 'touchStart'; actorRef: ActorRef; filter?: Extract<EventFilter, { target: string }> }>
  | Only<{ event: 'conditionTrue'; actorRef: ActorRef; condition: Expression }>
  | Only<{ event: 'interval'; actorRef: ActorRef; seconds: Expression }>;
// A heading as a block keeps it (05-command-presentation.ts, blockFieldValue): its event, its subject, and the key, the
// message or the part of its filter, or null while the filter is not chosen yet (a block's heading has no condition
// and no time: those are written only in 名人 text).
export type BlockHeading = { event: EventName; actorRef: ActorRef; filter?: EventFilter | null };
// A heading as the editor writes it before it is read (sentenceHeadingSource): a heading of a key, a message or a
// touch may have no filter yet (null).
export type UnfilteredHeading = { event: 'keyDown' | 'message' | 'touchStart'; actorRef: ActorRef; filter: null; condition?: never; seconds?: never };
// A script also has its text as read (the parser keeps it).
export type ScriptBase = NodeBase & { source?: string };
// One more script of a 名人 text, after the first one: its heading's note (※…) and its rules come with it, as a Script's.
export type ScriptUnit = ScriptBase & { kind: 'Script'; heading?: Heading; rules?: Rule[]; body: Statement[]; headingComment?: string };

// An extension's operation, by its qualified name (extension ID/operation ID).
export type ExtensionCommand = StatementBase & { kind: 'ExtensionCommand'; name: string; args: Expression[]; actorRef?: ActorRef; inlineComment: string };
export type ExtensionCalculation = NodeBase & { kind: 'ExtensionCalculation'; name: string; args: Expression[] };

// Sentences that only 名人 text writes, and the definition of a made block.
export type ActionDefinition = StatementBase & { kind: 'ActionDefinition'; name: string; args: string[]; inlineComment: string };
export type Parallel = StatementBase & { kind: 'Parallel'; lanes: Statement[][]; inlineComment: string };
export type ParallelEach = StatementBase & { kind: 'ParallelEach'; list: Expression; binder: string; body: Statement[]; inlineComment: string };
export type TimedRepeat = StatementBase & { kind: 'TimedRepeat'; seconds: Expression; body: Statement[]; actorRef: ActorRef; inlineComment: string };
export type MoveUntil = StatementBase & {
  kind: 'MoveUntil'; actorRef: ActorRef; direction: string; seconds: Expression; distance: Expression;
  condition?: Expression; duration?: Expression; inlineComment: string;
};
export type ListRemoveValue = StatementBase & { kind: 'ListRemoveValue'; target: TargetReference; value: Expression; actorRef: ActorRef; inlineComment?: string };
// 名人 forms of block sentences, with an op no block has: remove all the copies, stop a part's sounds, stop its copies'
// flows or its own.
export type MeijinCloneCommand = StatementBase & { kind: 'CloneCommand'; op: 'DELETE_ALL'; args: Expression[]; actorRef?: ActorRef; inlineComment?: string };
export type MeijinSoundCommand = StatementBase & { kind: 'SoundCommand'; op: 'STOP_PART'; args: Expression[]; actorRef?: ActorRef; inlineComment?: string };
export type MeijinStopCommand = StatementBase & { kind: 'StopCommand'; op: 'COPIES' | 'PART'; actorRef?: ActorRef; inlineComment?: string };
// 名人: a signal sent to some parts only (犬と鳥に「出発」と知らせる).
// broadcastRef: the name a wait for this signal's group reads it by (a 名人 その合図で始まったことが全部終わるまで待つ after it).
export type MeijinBroadcast = StatementBase & { kind: 'Broadcast' | 'BroadcastAndWait'; message: Expression; targets: Expression[]; actorRef: ActorRef; inlineComment?: string; broadcastRef?: string };
export type SyntaxExtraStatement = MeijinBroadcast | ActionDefinition | Parallel | ParallelEach | TimedRepeat | MoveUntil | ListRemoveValue | MeijinCloneCommand | MeijinSoundCommand | MeijinStopCommand;
// A part's name (名人), and the copies the sentence before made (名人).
export type PartName = NodeBase & { kind: 'PartName'; actorRef: ActorRef };
export type CreatedCopies = NodeBase & { kind: 'CreatedCopies' };
// 名人 parts as values: a part by its name, a part and its copies, a list without one part, one at random, the one
// picked by a rule, the nearest, the parts touching one, and a part's state (its speech or sound done, its copies).
export type PartRef = NodeBase & { kind: 'PartRef'; name: string };
export type PartFamily = NodeBase & { kind: 'PartFamily'; name: string };
export type PartExcept = NodeBase & { kind: 'PartExcept'; list: Expression; except: Expression };
export type PartRandom = NodeBase & { kind: 'PartRandom'; list: Expression };
export type PartPickRule = { kind: 'near'; to: string } | { kind: 'position'; side: '右' | '左' | '上' | '下' } | { kind: 'variable'; name: string; order: 'max' | 'min' };
export type PartPick = NodeBase & { kind: 'PartPick'; list: Expression; by: PartPickRule };
export type PartNearest = NodeBase & { kind: 'PartNearest'; of: Expression };
export type PartsTouching = NodeBase & { kind: 'PartsTouching'; target: Expression; of?: PartRef };
export type PartState = NodeBase & { kind: 'PartState'; state: 'speechDone' | 'soundDone' | 'copyCount'; actorRef: ActorRef };
// The value an extension event gave the flow (its block is in the schemas only when an extension has events).
export type ExtensionValueRead = NodeBase & { kind: 'SensorRead'; sensor: '拡張の値' };
export type SyntaxExtraExpression = ExtensionValueRead | PartName | CreatedCopies | PartRef | PartFamily | PartExcept | PartRandom | PartPick | PartNearest | PartsTouching | PartState;

// The members of an expression of the kind other than its kind, form by form (exprNode, 03-default-assets.ts): a kind
// among them would be the node's (exprNode writes the kind first), so they have none.
export type NodeProps<K> = Extract<Expression, { kind: K }> extends infer T ? T extends unknown ? Omit<T, 'kind'> & { kind?: never } : never : never;

// The members of a sentence of the kind as statementNode is given them (04-syntax-expressions.ts): it adds where the
// sentence is and its comment, and an empty args to a command that has none given.
export type StatementProps<K> = Extract<Statement | Rule, { kind: K }> extends infer T ? T extends unknown
  ? Omit<T, 'kind' | 'sourceSpan' | 'inlineComment' | 'args'> & Partial<Pick<T, 'args' & keyof T>> & { kind?: never } : never : never;

// The names a node is told apart by, as the parser takes them from a table of the words it reads: a sensor that reads
// nothing more (no arg), and the ways to compare.
export type FixedSensor = Exclude<SensorRead, { arg: unknown }>['sensor'];
export type CompareOp = CompareExpression['op'];
