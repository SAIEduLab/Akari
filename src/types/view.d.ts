// What the stage view (08-stage-view.ts) and the player of an exported work (08-player.ts) are given: the runtime
// they draw, and the editor's or the player's own calls. Types only; the product holds none of this.
import type { createAkariRuntime } from '../ts/01-runtime.ts';
import type { createAkariStageView } from '../ts/08-stage-view.ts';
import type { Backdrop, Project, RunnableProject } from './project.d.ts';
import type { RuntimeValue } from './runtime.d.ts';

// The runtime as createAkariRuntime returns it (the editor's AKARI_RUNTIME, or the one an exported work makes).
export type AkariCore = ReturnType<typeof createAkariRuntime>;
export type RuntimeModel = InstanceType<AkariCore['RuntimeModel']>;
export type EventScheduler = InstanceType<AkariCore['EventScheduler']>;
export type AssetRuntimeCache = InstanceType<AkariCore['AssetRuntimeCache']>;
// What an exported work holds (restoreExecutable reads it).
export type ExecutableData = Parameters<AkariCore['restoreExecutable']>[0];
// A value as a ふきだし shows it (displayValue), with the value itself.
export type ShownValue = ReturnType<AkariCore['displayValue']> & { value: RuntimeValue };
// The room the stage has and its own size, for a scale chosen by the screen that shows it.
export interface StageRoom { width: number; height: number; availableWidth: number; availableHeight: number }
export interface StageViewOptions {
  form: HTMLElement; canvas: HTMLCanvasElement;
  getProject(): RunnableProject; getRuntime(): RuntimeModel | null; getScheduler(): EventScheduler | null;
  imageUrl(id: string): string; getImage(id: string): HTMLImageElement | null | undefined;
  // The dots over the backdrop (the editor's ruler); an exported work has none.
  dots?: boolean;
  // The scale of the stage (the editor's zoom, or 1); without it the stage shrinks to the room it has.
  getScale?(room: StageRoom): number; availableWidth?(): number; availableHeight?(): number;
  // The touch-action of the running screen ('none' unless given).
  runTouch?: string;
  canInteract?(): boolean; onError?(error: Thrown): void; onFit?(scale: number): void; onInputChanged?(): void;
  onStageMessage?(text: string, details: ShownValue): void; onValueDetails?(value: RuntimeValue, speaker: string): void;
  // A click on a part while the work runs; false stops it from starting the part's 押されたとき.
  onRuntimeClick?(runtimeId: string): boolean | void;
  // The edit screen: the part chosen, a press on a part or on the stage.
  selectedId?(): string | null; onDesignPointer?(event: PointerEvent, id: string): void; onDesignStage?(event: PointerEvent): void;
}
export type StageView = ReturnType<typeof createAkariStageView>;

// What the stage view draws with: a part as it is now (an actor while the work runs, else the part itself), a backdrop
// with a picture, the node of a part on the stage (an input part's is an input; _composing: a word is being made with
// an IME), and a box on the stage from its top-left corner.
export type Shown = { costumeId?: string | null; text: string };
export type ImageBackdrop = Extract<Backdrop, { kind: 'image' }>;
export type PartNode = HTMLElement & { _composing?: boolean };
export type InputNode = HTMLInputElement & { _composing?: boolean };
export type Rect = { left: number; right: number; top: number; bottom: number };

// The player of an exported work: what it is doing (its buttons and status line follow it), the element the focus was
// on before a question (an HTML, SVG or MathML element: each can take the focus; a button can be disabled, an HTML
// element hidden), and what
// a throw may carry (any value, read for the parts an error has: a value without them reads undefined).
export type PlayerPhase = 'LOADING' | 'READY' | 'PREPARING' | 'WAITING' | 'RUNNING' | 'PAUSED' | 'FINISHED' | 'FAILED' | 'STOPPED' | 'ERROR';
export type FocusTarget = Element & HTMLOrSVGElement & { disabled?: boolean; hidden?: HTMLElement['hidden'] };
export type Thrown = { code?: unknown; message?: unknown; detail?: unknown; name?: unknown } | null | undefined;
// An element's data as it is written (element.dataset): the browser keeps the text of any value it is given (a number as
// its digits); read back, each is text.
export type DataWrites = { [name: string]: unknown };
