/* SPDX-License-Identifier: MIT */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Unit = '歩' | '秒' | '度' | '回' | '番目' | '点' | '個' | '％' | 'Hz';
export interface Quantity { magnitude: number; unit: Unit }
export type Scalar = number | string | boolean | Quantity;
export type Value = Scalar | Scalar[];
export interface ValueSpec { type: 'number' | 'string' | 'boolean' | 'list' | 'value' | 'void'; unit: Unit | null }
export interface ArgumentSpec extends ValueSpec { name: string }
export interface Operation {
  id: string; name: string; description: string; args: ArgumentSpec[];
  returns: ValueSpec; async: boolean; capability?: string;
}
export interface ExtensionEvent { id: string; name: string; description: string; payload: ValueSpec }
export interface Standard { languageContractId: number; runtimeContractId: number }
export interface Identity { id: string; version: string; contentHash: string }
export interface Manifest {
  id: string; version: string; apiContract: 1; standard: Standard; description: string;
  dependencies: Identity[]; capabilities: string[]; offline: boolean; selfContained: boolean;
  state: { formatVersion: number; initial: Json };
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
export interface InvokeContext { readonly signal: AbortSignal; readonly sessionId: string; [key: string]: unknown }
export interface Instance {
  commands?: { [id: string]: (args: Value[], context: InvokeContext) => Value | null | void | Promise<Value | null | void> };
  calculations?: { [id: string]: (args: Value[], context: InvokeContext) => Value };
  initialize?(): void; dispose?(): void | Promise<void>;
}
export type Factory = (api: FactoryApi) => Instance;
export type OperationKind = 'command' | 'calculation' | 'event' | 'commands' | 'calculations' | 'events';
export type Description = (Operation | ExtensionEvent) & { extensionId: string; name: string; qualifiedName: string; displayName: string; kind: string };
export interface ExtensionHost {
  readonly apiContract: 1; readonly standard: Standard; readonly active: boolean; readonly sessionId: string | null; readonly sealed: boolean;
  register(manifest: Manifest, factory: Factory): Identity;
  seal(): void;
  operations(kind: OperationKind): Description[];
  describe(qualifiedName: string, kind: OperationKind): Description | null;
  invokeCalculation(qualifiedName: string, args: Value[], context?: Partial<InvokeContext>): Value;
  invokeCommand(qualifiedName: string, args: Value[], context?: Partial<InvokeContext>): Value | null | Promise<Value | null>;
  beginSession(settings?: { state?: StateRecord[]; onEvent?: (event: EventDelivery) => void; capabilities?: string[] }): string;
  endSession(): void;
  requirements(): Requirements; validateRequirements(envelope: Requirements): true;
  initialState(): StateRecord[]; snapshotState(): StateRecord[]; restoreState(state: StateRecord[]): void;
  exportDefinitions(): { manifest: Manifest; factorySource: string; contentHash: string }[];
  connectWindow(targetWindow: Window, settings: { origin: string; capabilities?: string[]; timeoutMs?: number }): Promise<Connector>;
}
export interface HostOptions {
  standard?: Standard; allowedCapabilities?: string[]; reservedNames?: string[];
  validateValue?(value: unknown, spec: ValueSpec): Value | null | void;
  validateProfileRequirement?(profile: Requirements['profile']): void;
  onError?(error: unknown): void;
}
export declare function createAkariExtensionHost(options?: HostOptions): ExtensionHost;
