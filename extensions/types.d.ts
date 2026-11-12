/* SPDX-License-Identifier: MIT */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Unit = '歩' | '秒' | '度' | '回' | '番目' | '点' | '個' | '％' | 'Hz';
/** A type, not an interface, so that a Value is also Json (an extension keeps one in its state). */
export type Quantity = { magnitude: number; unit: Unit };
export type Scalar = number | string | boolean | Quantity;
export type Value = Scalar | Scalar[];
export interface ValueSpec { type: 'number' | 'string' | 'boolean' | 'list' | 'value' | 'void'; unit: Unit | null }
export interface ArgumentSpec extends ValueSpec { name: string }
export interface Operation {
  id: string; name: string; description: string; args: ArgumentSpec[];
  returns: ValueSpec; async: boolean; capability?: string;
  /** "meijin": usable only in 名人 text (no block, not in an ordinary body). "all" (the default): everywhere. */
  scope?: 'all' | 'meijin';
}
export interface ExtensionEvent { id: string; name: string; description: string; payload: ValueSpec; scope?: 'all' | 'meijin' }
export interface Standard { languageContractId: number; runtimeContractId: number }
export interface Identity { id: string; version: string; contentHash: string }
export interface Manifest {
  /** Japanese extension name shown in code and blocks; IDs remain accepted when reading code. */
  id: string; name?: string; version: string; apiContract: 1; standard: Standard; description: string;
  dependencies: Identity[]; capabilities: string[]; offline: boolean; selfContained: boolean;
  /** persist: "run" (default) starts every run from initial; "project" keeps the state in the work. */
  state: { formatVersion: number; initial: Json; persist?: 'run' | 'project' };
  commands: Operation[]; calculations: Operation[]; events: ExtensionEvent[];
}
export interface StateRecord { id: string; formatVersion: number; value: Json }
export interface Requirements {
  apiContract: 1; standard: Standard; required: Identity[]; capabilities: string[];
  profile?: Identity | null;
  state?: StateRecord[];
}
export interface EventDelivery { name: string; payload: Value; sessionId: string; connectionId?: string; sequence?: number }
export interface RequestOptions { signal?: AbortSignal; timeoutMs?: number }
export interface BatchItem extends RequestOptions { method: string; params?: Json[] | { [key: string]: Json }; notification?: boolean }
export interface Connector {
  readonly ready: boolean; readonly connectionId: string; readonly sessionId: string; readonly capabilities: string[];
  request(method: string, params?: Json[] | { [key: string]: Json }, options?: RequestOptions): Promise<Json>;
  notify(method: string, params?: Json[] | { [key: string]: Json }): void;
  batch(items: BatchItem[]): Promise<Json[]>;
  close(reason?: string): void;
}
export interface FactoryApi {
  readonly signal: AbortSignal; readonly sessionId: string; readonly connector: Connector | null;
  getState(): Json; setState(value: Json): void; emit(eventId: string, payload: Value): void;
}
/** Where a part is when runtime.actor is called (EXTENSIONS.md 座標と向き): a new frozen copy at each call, so writing to it
 * changes nothing (a TypeError in strict code). Call runtime.actor again to read the part later. */
export interface PartView {
  readonly runtimeId: string; readonly baseId: string; readonly isClone: boolean;
  /** Steps from the screen's bottom-left corner to the part's centre; right and up are positive. */
  readonly x: number; readonly y: number;
  /** Right is 0, up is 90, counterclockwise; 0 or more and less than 360. */
  readonly direction: number;
}
export interface InvokeContext {
  readonly signal: AbortSignal; readonly sessionId: string;
  /** The part (or "stage") whose sentence calls the handler. */
  readonly runtimeId: string;
  /** runtime.actor(context.runtimeId) is the calling part; it is null for the stage and for an id that is no part of the run.
   * A sentence of a run gives these four keys only, and no other run information. A handler called through the host
   * directly (invokeCommand, invokeCalculation) is given signal and sessionId, with what the caller gives. */
  readonly runtime: { actor(runtimeId: string): PartView | null };
}
export interface Instance {
  commands?: { [id: string]: (args: Value[], context: InvokeContext) => Value | null | void | Promise<Value | null | void> };
  calculations?: { [id: string]: (args: Value[], context: InvokeContext) => Value };
  initialize?(): void; dispose?(): void | Promise<void>;
}
export type Factory = (api: FactoryApi) => Instance;
/** A manifest with its factory, as register takes them (and as the examples give them). */
export interface Definition { manifest: Manifest; factory: Factory }
export type OperationKind = 'command' | 'calculation' | 'event' | 'commands' | 'calculations' | 'events';
/** What the host adds to an operation or an event it describes: whose it is, and its qualified and displayed names;
 * kind is the list it is in (commands, calculations or events). */
export type Described = { extensionId: string; extensionName: string; name: string; qualifiedName: string; displayName: string; kind: 'commands' | 'calculations' | 'events'; scope: 'all' | 'meijin' };
/** A command or a calculation as the host describes it (operations and describe of those kinds), and an event. */
export type OperationDescription = Operation & Described & { kind: 'commands' | 'calculations' };
export type EventDescription = ExtensionEvent & Described & { kind: 'events' };
export type Description = OperationDescription | EventDescription;
export interface Upgrade { id: string; name: string; from: string; to: string }
export interface StateInfo { id: string; name: string; formatVersion: number; persist: 'run' | 'project' }
export interface ExtensionHost {
  readonly apiContract: 1; readonly standard: Standard; readonly active: boolean; readonly sessionId: string | null; readonly sealed: boolean;
  register(manifest: Manifest, factory: Factory): Identity;
  seal(): void;
  operations(kind: 'command' | 'calculation' | 'commands' | 'calculations'): OperationDescription[];
  operations(kind: 'event' | 'events'): EventDescription[];
  operations(kind: OperationKind): Description[];
  describe(qualifiedName: string, kind: 'command' | 'calculation' | 'commands' | 'calculations'): OperationDescription | null;
  describe(qualifiedName: string, kind: 'event' | 'events'): EventDescription | null;
  describe(qualifiedName: string, kind: OperationKind): Description | null;
  /** Map an extension ID or Japanese name and an operation ID or Japanese name to the qualified name. */
  resolve(extension: string, operation: string, kind: OperationKind): string | null;
  invokeCalculation(qualifiedName: string, args: Value[], context?: Partial<InvokeContext>): Value;
  invokeCommand(qualifiedName: string, args: Value[], context?: Partial<InvokeContext>): Value | null | Promise<Value | null>;
  beginSession(settings?: { state?: StateRecord[]; onEvent?: (event: EventDelivery) => void; capabilities?: string[] }): string;
  endSession(): void;
  /** Every registered extension; given IDs, those extensions and what they depend on. */
  requirements(ids?: Iterable<string>): Requirements;
  /** The envelope is a work's record as read: anything that is not a valid Requirements is refused (E703, or E701 for a
   * key that is not plain data such as __proto__). Its profile is checked by validateProfileRequirement when the host was
   * given one (the product refuses a profile it does not know with E_PROFILE); a host without it keeps the profile. */
  validateRequirements(envelope: unknown): true;
  /** Rewrite a work's requirements recorded with an older release of the same major version; a registered extension a
   * newer release depends on and the work does not record is added with its initial state; with the upgrades, a recorded
   * extension that is not registered, is named in unused and that nothing left in the record depends on is dropped. */
  upgradeRequirements(envelope: unknown, unused?: Iterable<string>): { envelope: Requirements; upgrades: Upgrade[]; dropped: string[] };
  initialState(): StateRecord[]; snapshotState(): StateRecord[]; restoreState(state: StateRecord[]): void;
  /** Return kept ("project") state to the initial value while no session runs. */
  resetState(id?: string): void; stateInfo(): StateInfo[];
  exportDefinitions(): { manifest: Manifest; factorySource: string; contentHash: string }[];
  connectWindow(targetWindow: Window, settings: { origin: string; capabilities?: string[]; timeoutMs?: number }): Promise<Connector>;
}
export interface HostOptions {
  standard?: Standard; allowedCapabilities?: string[]; reservedNames?: string[];
  /** Check a value given to or taken from an extension: give the value to use, or nothing to use it as given; throw to
   * refuse it. (A command's void result is checked by the host itself.) */
  validateValue?(value: unknown, spec: ValueSpec, incoming?: boolean): Value | void;
  /** Given the profile a work's requirements record, as read (not yet checked). */
  validateProfileRequirement?(profile: unknown): void;
  onError?(error: unknown): void;
}
export declare function createAkariExtensionHost(options?: HostOptions): ExtensionHost;
