// The scheduler's own types (01-runtime-scheduler.ts): its flows, their frames and waits, the watches and rules it
// keeps, the error records it makes. Types only; the product holds none of this.
import type { RuntimeBase } from '../ts/01-runtime-base.ts';
import type { RuntimeModel } from '../ts/01-runtime-model.ts';
import type { CompiledRule, RunnableItem, RunnableProgram, SyntaxItem } from './compiled.d.ts';
import type { EventFilter, Project, RunnableProject } from './project.d.ts';
import type { PartValue, RuntimeValue, ScalarValue, WatchPose } from './runtime.d.ts';
import type { Binder, CallFrame, EventContext, FrameSnapshot, RuntimeExpression, RuntimeUi } from './run.d.ts';
import type { EventDelivery } from '../../extensions/types.d.ts';
import type { ForEach, Forever, RepeatCount, RepeatUntil, RepeatWhile, Statement } from './syntax.d.ts';

export type Runtime = InstanceType<RuntimeModel['RuntimeModel']>;
export type RuntimeError = InstanceType<RuntimeBase['AkariError']>;
export type Evaluation = Generator<unknown, RuntimeValue, unknown>;
// A loop frame's marks for this turn (paceTurn): it changed the screen, it waited, it already gave up its こま.
export interface TurnMarks { visual?: boolean; waited?: boolean; yielded?: boolean }
// What a flow runs, innermost last: a list of sentences, the loops it is in, a made block's boundary.
export type ExecFrame = TurnMarks & (
  | { type: 'seq'; nodes: Statement[]; index: number; binder?: Binder }
  | { type: 'frameYield'; node: Statement }
  | { type: 'repeatCount'; node: RepeatCount; remaining: number }
  | { type: 'while'; node: LoopNode; condition?: RuntimeExpression }
  | { type: 'until'; node: RepeatUntil; condition?: RuntimeExpression }
  | { type: 'forever'; node: Forever }
  | { type: 'foreach'; node: ForEach; values: ScalarValue[]; index: number }
  | { type: 'callBoundary'; frame: CallFrame });
export type LoopNode = RepeatWhile | Extract<Statement, { kind: 'TimedRepeat' }>;
// Why a flow waits: a time (a こま of the pacing, a speech), an extension's answer, a condition, an answer to a
// question, the flows of a signal or of its own lanes, a 名人 move, a glide, a sound, a calculation in steps.
// (speechToken: only the time a speech is shown has one)
// (frame: a こま of the pacing; lanes: the wait for the flow's own lanes)
export type BlockRequest = { speechToken?: object; frame?: boolean; lanes?: boolean } & (
  | { kind: 'time'; deadline: number }
  | { kind: 'extension' }
  | { kind: 'condition'; condition: RuntimeExpression; evaluator?: Evaluation | null }
  | { kind: 'question' }
  | { kind: 'waitGroup'; waitGroupId: string }
  | { kind: 'moveUntil'; key: string; condition: RuntimeExpression | null; deadline: number | null; evaluator?: Evaluation | null }
  | { kind: 'glide'; startTime: number; deadline: number; duration: number; startDirection: number; turn: number; lastDirection: number }
  | { kind: 'glide'; startTime: number; deadline: number; duration: number; turn?: undefined;
      startX: number; startY: number; targetX: number; targetY: number; lastX: number; lastY: number }
  | { kind: 'audio'; handleId: string }
  | { kind: 'calculation'; evaluator: Generator<unknown, Statement, unknown>; epoch: number | undefined; loopFrame: Extract<ExecFrame, { type: 'while' | 'until' }> | null; originalNode: Statement });
// A wait as the flow keeps it: with the part it is for (block adds it).
export type BlockReason = BlockRequest & { runtimeId: string };
export type TaskState = 'READY' | 'RUNNING' | 'BLOCKED' | 'DONE' | 'CANCELLED' | 'ERROR';
// A flow of sentences: a body started by an event, a lane of one, a watch's or a rule's own.
export interface Task {
  taskId: string; scriptId?: string | null; subject: { runtimeId: string }; broadcastGroups: Map<string, string>;
  targetId: string; runtimeId: string; eventType: string; eventContext: EventContext; lastAnswer?: RuntimeValue;
  callFrames: CallFrame[]; execStack: ExecFrame[]; state: TaskState; waitGroupId?: string | null; createdSequence?: number;
  error?: RuntimeError | null; errorCallStack?: string[]; failureRecordId?: number; blockReason?: BlockReason | null;
  paceTick?: number | null; waitStartedAt?: number | null; currentNode?: Statement | CompiledRule; sourceKey?: string | null; inheritedBinders?: Binder[];
  laneParent?: Task; laneRoot?: Task; extensionAbort?: AbortController; createdCopies?: PartValue[];
}
// The flows started by one signal (or a flow's lanes), and the flow that waits for them.
export interface WaitGroup { id: string; sender: Task; pending: Set<string>; ref?: string; references?: Map<string, string> }
// A continuous rule (or a 名人 move) of one part, and how far it has moved.
export type Continuous = RuleControl | MoveControl;
export interface RuleControl {
  // (CANCELLED_UNTIL_FALSE: stopped until its condition is false again, by ほかの動きを全部止める or by a stop of its part's
  // motions: 自分のほかの動きを止める, 名人's 〜の動きを止める and その部品のコピーの動きを止める)
  rule: CompiledRule; runtimeId: string; task: Task; state: 'INACTIVE' | 'ACTIVE' | 'CANCELLED_UNTIL_FALSE'; speed: number; temporary?: false;
  evaluator?: Generator<unknown, number | null, unknown> | null;
}
// 名人: a move that goes on until its condition or time (〜まで動き続ける), from startTime, moved so far.
export interface MoveControl {
  rule: { id: string; direction: string }; runtimeId: string; task: Task; state: 'ACTIVE' | 'CANCELLED_UNTIL_FALSE'; speed: number; temporary: true;
  startTime: number; moved: number;
}
// A body started by a change (ふれたとき, 〜になったとき) or a period (〜秒ごとに), and what it last saw.
export interface Watch {
  item: RunnableItem; targetId: string; scriptId: string; event: string; task: Task;
  last: Map<string, boolean | string[]>; started: Map<string, number>; period?: number; nextAt?: number;
  partners?: Record<string, unknown>[]; poses?: Map<string, WatchPose>;
  // (a 名人 condition calculated a step at a time under a profile's own limits: readCondition)
  evaluator?: Evaluation | null;
}
// A run's error as the editor shows it (taskError): where it is, the flow and made blocks it was in, the values then.
export interface ErrorRecord {
  id: number; taskId: string; targetId: string; runtimeId: string; eventType: string; eventContext: EventContext;
  code: string; message: string; key: string; line: number; column: number; statement: string; source: string;
  quotedList?: { name: string; span: { startLine: number; startColumn: number; endLine: number; endColumn: number }; targetId: string; ownerKey: string };
  callStack: string[]; frames: FrameSnapshot[]; binders: [string, RuntimeValue][];
  projectVariables: [string, RuntimeValue][]; projectLists: [string, RuntimeValue][];
  actor: { runtimeId: string; baseId: string; x: number; y: number; direction: number; scalePercent: number; visible: boolean;
    variables: [string, RuntimeValue][]; lists: [string, RuntimeValue][] } | null;
  chars?: number;
}
// A body of the work as matchingScripts reads it (from the read work, or the older forms it also takes).
export interface ScriptEntry { key: string; scriptId?: string; id?: string; targetId?: string | null; ownerId?: string; event?: string | null; filter?: EventFilter | string | null }
// What normalizeStack finds on top: a frame to go on with, or a loop with nothing to run in this turn.
export type StackTop = ExecFrame | { type: 'idle'; node: Statement };
// A step of a flow: a sentence to run, a loop with nothing to run, a こま to wait for, a loop's condition to read.
export type Step = { kind: 'node' | 'idle' | 'frameYield'; node: Statement } | { kind: 'loopHeader'; frame: Extract<ExecFrame, { type: 'while' | 'until' }>; node: Statement };

// The scheduler's state (EventScheduler: the class gets these by declaration merging).
export interface SchedulerFields {
  project: RunnableProject;
  compiled: RunnableProgram;
  runtime: Runtime;
  ui: RuntimeUi;
  ready: Task[];
  tasks: Map<string, Task>;
  blocked: Set<Task>;
  waitGroups: Map<string, WaitGroup>;
  pendingExternalUnblocks: Set<string>;
  seq: number;
  waitSeq: number;
  // The speech each part shows now, by an object of its own (a later speech replaces it).
  speechTokens: Map<string, object>;
  running: boolean;
  stoppedAll: boolean;
  paused: boolean;
  loopScheduled: boolean;
  loopTimer: ReturnType<typeof setTimeout> | { soon: true } | null;
  loopDue: number;
  inLoop: boolean;
  questionQueue: { task: Task; runtimeId: string; question: string }[];
  activeQuestion: { task: Task; runtimeId: string; question: string } | null;
  errorRecords: ErrorRecord[];
  errorSequence: number;
  errorRecordChars: number;
  questionTimer: ReturnType<typeof setTimeout> | null;
  continuous: Map<string, Continuous>;
  continuousOrigin: number | null;
  continuousTime: number | null;
  continuousTick: number;
  continuousTrace: { ruleId: string; runtimeId: string; from: number; to: number; dx: number; dy: number }[];
  geometryStamp: number;
  movedParts: Set<string>;
  movedNow?: Set<string>;
  touchStamp?: number;
  pollTick: number | null;
  dueAt: number;
  watches?: Watch[];
  extensionEpoch?: number;
  // (an answer's step, or null where an event of extensionEvents came)
  extensionCompletions?: ((() => void) | null)[];
  extensionEvents?: EventDelivery[];
}
