// What a run is made of (01-runtime-model.ts, 01-runtime-scheduler.ts): the parts as they are now, the flows of
// sentences (tasks) and the frames they run. Types only; the product holds none of this.
import type { RuntimeValue, ScalarValue, PartValue } from './runtime.d.ts';
import type { Expression, Statement } from './syntax.d.ts';
import type { NodeBase, Unit } from './syntax-base.d.ts';
import type { RuntimeError, Task } from './scheduler.d.ts';

// A part as it is during the run (RuntimeModel.makeActor): a part of the work, or a copy of one.
export interface Actor {
  runtimeId: string; baseId: string; isClone: boolean; creationSequence: number;
  x: number; y: number; w: number; h: number; direction: number; scalePercent: number; visible: boolean;
  color: string | null; costumeId: string | null; z: number; text: string; inputValue: string;
  volume: number; pitch: number; penDown: boolean; penColor: string; penSize: number;
  vars: Map<string, RuntimeValue>; lists: Map<string, ScalarValue[]>;
}
// The name a list repeat gives each item (ForEach's binder) while its body runs.
export interface Binder { name: string; value: RuntimeValue }
// A made block being run: its arguments, its own variables and lists (この中だけ), and the line it is at.
interface FrameBase {
  id: string; name: string; currentLine?: number;
  args: Map<string, RuntimeValue>; locals: Map<string, RuntimeValue>; localLists: Map<string, ScalarValue[]>;
}
// A procedure (てじゅん) being run in a flow: the part it runs for, and its own 合図 groups (the name a later wait
// uses, and the group's id).
export type CallFrame = FrameBase & { runtimeId: string; broadcastGroups: Map<string, string> };
// A function (答えを もとめる) being calculated: the part whose sentence called it.
export type FunctionFrame = FrameBase & { selfRuntimeId: string };
// A frame as an error keeps it (the child sees where the made blocks were when it stopped).
export interface FrameSnapshot {
  kind: string; id: string; name: string; line: number;
  args: [string, RuntimeValue][]; locals: [string, RuntimeValue][]; localLists: [string, RuntimeValue][];
}
// Conditions the runtime makes from the written ones (they are evaluated like expressions): a count reached since the
// wait began, a time not yet passed, a part value written in place.
export type EventCountBound = NodeBase & { kind: 'EventCountBound'; key: string; baseline: number; target: number };
export type DeadlineBound = NodeBase & { kind: 'DeadlineBound'; deadline: number };
export type PartValueNode = NodeBase & { kind: 'PartValue'; value: PartValue };
// A value written back as an expression (valueExpression): a number with any unit or none, a list of such.
export type ValueQuantity = NodeBase & { kind: 'QuantityLiteral'; unit: Unit | null; value: RuntimeExpression };
export type ValueList = NodeBase & { kind: 'ListLiteral'; items: RuntimeExpression[] };
export type RuntimeExpression = Expression | EventCountBound | DeadlineBound | PartValueNode | ValueQuantity | ValueList;
// What the event that started a flow gives it: the key, the message, an extension event's value, the old and new
// values of a change.
export interface EventContext {
  key?: string; message?: string; payload?: RuntimeValue;
  oldValue?: RuntimeValue; newValue?: RuntimeValue; oldName?: string; newName?: string;
  // (a copy's start: the part it was copied from)
  sourceRuntimeId?: string;
}
// How many steps the calculations of made blocks have taken so far, counted against LIMITS.functionOps.
export interface Budget { count: number }
// What the evaluation reads of the flow it runs in (the scheduler's task has more).
export interface FlowView {
  callFrames: CallFrame[]; execStack: { type: string; binder?: Binder }[]; inheritedBinders?: Binder[];
  // 答え: the answer to the last question, or what the last extension command gave back.
  createdCopies?: PartValue[]; lastAnswer?: RuntimeValue;
}
// What a runtime calls on the screen that shows it (the editor's stage view, the exported player); each may be left out.
export interface RuntimeUi {
  render?(): void; renderMonitor?(): void; state?(): void; allStopped?(): void;
  // (timed: the speech lasts as long as the sentence says, and the runtime clears it; otherwise it goes away by itself)
  say?(runtimeId: string, text: string, timed?: boolean): void; clearSpeech?(runtimeId: string): void; prepareSpeech?(value: RuntimeValue): void;
  ask?(question: string, answer: (text: string) => void): void; closeQuestion?(): void;
  penLine?(x1: number, y1: number, x2: number, y2: number, color: string, size: number): void; penClear?(): void; stamp?(runtimeId: string): void;
  beforeStatement?(flow: Task, node: Statement): void; afterStatement?(flow: Task, node: Statement): void;
  continuousStep?(entry: unknown): void; runtimeError?(flow: Task, error: RuntimeError): void;
}
// A box on the screen (bottom is the smaller たてのばしょ) and its centre.
export interface Box { left: number; right: number; bottom: number; top: number; cx: number; cy: number }
