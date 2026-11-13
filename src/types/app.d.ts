// The application (initApp, 11-application.ts, and its parts 11-app-tools-core.ts, 11-app-tools.ts,
// 11-app-services.ts, 11-app-run.ts, 11-app-commands.ts and 11-app-drawing.ts): the state it shares with its parts, the
// calls each part offers the parts after it, and the redraws the parts ask for. Types only; the product holds none of
// this.
import type { AkariError } from '../ts/02-language-contracts.ts';
import type { scriptMetadataFromHeading } from '../ts/07-semantic-analysis-core.ts';
import type { decodeWorkspaceHistory } from '../ts/07-semantic-analysis.ts';
import type { createBlockEditorView } from '../ts/10-block-view.ts';
import type { prepareBlockEdit } from '../ts/09-editor-sessions.ts';
import type { AssistCandidate } from './assist.d.ts';
import type { BlockTree, InsertLocation } from './blocks.d.ts';
import type { CompiledProject, Diagnostic, DiagnosticLike, DraftRecord, SourceRecord, Symbols, SyntaxItem } from './compiled.d.ts';
import type { CallableDraft, EditorContext, EditorSession, EditorState, Hint, PendingEdit, SavedWorkspaceHistory, TutorialFacts, TutorialState, TutorialStep } from './editor.d.ts';
import type { PageFinder } from './page.d.ts';
import type { AssetRecord, Proposal, RuntimeValue } from './runtime.d.ts';
import type { ActionDefinitionData, Component, ComponentType, Costume, MeijinScript, EventFilter, EventName, FunctionDefinitionData, Project, ProjectScript, Sound, Stage } from './project.d.ts';
import type { Script, Statement } from './syntax.d.ts';
import type { Heading, Readable, UnfilteredHeading } from './syntax-base.d.ts';
import type { OperationAnswer, ViewOperation } from './block-view.d.ts';
import type { AkariCore, AssetRuntimeCache, EventScheduler, RuntimeModel, StageView } from './view.d.ts';
import type { ErrorRecord, RuntimeError, Task } from './scheduler.d.ts';
import type { RuntimeUi } from './run.d.ts';

// The store of the work's pictures and sounds (the runtime's AssetStore).
export type AssetStore = InstanceType<AkariCore['AssetStore']>;
// A block view the application shows (createBlockEditorView).
export type BlockEditorView = ReturnType<typeof createBlockEditorView>;

// One state of the history (snapshot): the work and its pictures and sounds, what is chosen, the fingerprints of the
// work and of the whole state, the editors, and the made block being written.
export interface AppSnapshot {
  project: Project; assets: Map<string, AssetRecord>; selectedId: string; currentEvent: EventName; selectedScriptId: string | null;
  fingerprint: string; stateFingerprint: string; editorState: EditorState; draft: CallableDraft; callableBaseline: string;
  callableLoadedKey: string; draftSerial: number; draftOpen: boolean;
}
// A state the history holds: a snapshot, or a state restored from what this computer kept, which has no choice, made
// block draft or state fingerprint of its own (its editor state holds the choice, and restoreSnap takes the rest as they
// start).
export type HistoryState = Omit<AppSnapshot, 'selectedId' | 'currentEvent' | 'selectedScriptId' | 'stateFingerprint' | 'draft'> &
  Partial<Pick<AppSnapshot, 'selectedId' | 'currentEvent' | 'selectedScriptId' | 'stateFingerprint' | 'draft'>>;
// An editor of a source, as the application keeps it (mainEditor, draftEditor): which one, its text area, its session and
// its block view, the help offered for a sentence that does not read (and its timer and the candidates found), the
// mistake shown, and the source the view was last drawn for. (the view is none only until initApp makes it, before the
// child can do anything)
export interface EditorBinding {
  kind: 'script' | 'draft'; textarea: HTMLTextAreaElement; session: EditorSession | null; view: BlockEditorView | null;
  assist?: { basis: string; diagnostic: Diagnostic; proposals: Proposal[]; ownerKey: string; contextRevision: number } | null;
  assistTimer?: ReturnType<typeof setTimeout> | 0; assistCache?: { key: string; candidates: AssistCandidate[] };
  failurePresentation?: string; renderedOwner?: string;
}
// The elements of the page the application uses most (el).
export interface AppElements {
  form: HTMLDivElement; frame: HTMLDivElement; title: HTMLDivElement; canvas: HTMLCanvasElement; tree: HTMLDivElement;
  props: HTMLDivElement; monitor: HTMLDivElement; obj: HTMLSelectElement; event: HTMLSelectElement; editor: HTMLTextAreaElement;
  gutter: HTMLDivElement; issue: HTMLDivElement; hints: HTMLDivElement; console: HTMLDivElement; status: HTMLSpanElement;
  autosave: HTMLSpanElement; runState: HTMLSpanElement; dirty: HTMLSpanElement; projectName: HTMLInputElement; fileInput: HTMLInputElement;
}
// The guide (いっしょに作る) as the application keeps it: its state, the values the child chose, and the part it is about.
// (the courses and the extensions chosen; its steps, which the choices add to)
export type AppTutorial = TutorialState & { values: { [step: string]: unknown }; target: string; identity: number; trace?: TutorialTrace | null; courses: string[]; leaves: string[]; steps: readonly TutorialStep[] };
// The guide left (finishTutorial): where it was, and the work and the editors it was left with.
export type PausedTutorial = AppTutorial & { fingerprint: string; editorFingerprint: string };
// What the guide sees of a run it asked for (tutorialTrace): the run, the part's place before it, the clicks asked for,
// what the work said and did, and how the run ended. (a sentence the part ran: its kind, the place the part was at and
// the clicks so far; what the part was like each time it finished)
export interface TutorialTrace {
  epoch: number; trial: string; x: number; y: number; requiredClicks: number | undefined;
  statements: { kind: string; op: string | null; x: number; y: number; click: number }[]; speech: string[];
  observations: { x: number; y: number; score: RuntimeValue | undefined; direction: number; scale: number; costume: string | null }[];
  clicks: number; busy: boolean; sawTask: boolean; complete: boolean; failed: boolean;
}

// The state the application shares with its parts, assigned by initApp at its top level. initApp calls some of the
// parts' functions while it assigns it ($, applyUiLevel): no call reads a part of it before initApp has written it (a
// browser run with the bag as a Proxy found none: FILLED_BAGS).
export interface AppVars {
  // (the last step of the queue gives whether the work was kept, or cleared)
  initialSnapshot: HistoryState | null; autosaveQueue: Promise<boolean | void>; recoveryEpoch: number; autosaveRevisionTime: number;
  // (a drag in progress ends with the event that ends it: a pointer's, a blur, or one only named, such as an escape)
  lastObservedFingerprint: string | null; activeDragCleanup: ((event?: DragEnd) => void) | null;
  // (a copy of the part being moved or resized, at the place or the size it would take)
  designResizePreview: Component | null; colorEdit: ColorEdit | null;
  callableBaseline: string; callableLoadedKey: string; debugSourceKey: string | null;
  runtimePaintFrame: number | null; runtimePaintFlags: number;
  project: Project; assetStore: AssetStore; selectedId: string; currentEvent: EventName; selectedScriptId: string | null;
  runtime: RuntimeModel | null; runtimeCache: AssetRuntimeCache | null; scheduler: EventScheduler | null; compiled: CompiledProject | null;
  activeLoc: RunLocation | null; keptFail: RunLocation | null; activeTaskId: string | null; dirty: boolean; lastSavedFingerprint: string;
  lastSavedEditorFingerprint: string; history: HistoryState[]; redo: HistoryState[];
  historyTimer: ReturnType<typeof setTimeout> | 0 | null; queuedHistory: AppSnapshot | null;
  autosaveTimer: ReturnType<typeof setTimeout> | null; recoveryData: RecoveryData | null; appState: AppState; runFinished: boolean;
  runFailed: boolean; runPressedAt: number; generationToken: number; designObjectUrls: Map<string, string>;
  previewAudio: { context: AudioContext; source: AudioBufferSourceNode | null } | null; el: AppElements;
  propertyHeaderObserver: ResizeObserver | null; editorContextRevision: number; editorDraftSerial: number; syncingDraft: boolean;
  headerPending: Omit<PendingEdit, 'kind'> | null; callableDraftCore: CallableDraft;
  editorSessions: Map<string, EditorSession>; editorModes: Map<string, 'code' | 'blocks'>;
  mainEditor: EditorBinding; draftEditor: EditorBinding;
  sourceOverviewOpen: boolean; sourceOverviewViews: BlockEditorView[]; sourceOverviewObserver: IntersectionObserver | null;
  sourceOverviewSignature: string; entryLayoutPlaced: boolean; entryControlHomes: Map<Element, Comment>; placeHistoryButtons: () => void;
  tutorial: AppTutorial | null; pausedTutorial: PausedTutorial | null; tutorialEpoch: number; workspaceIdentity: number;
  tutorialNotice: { step: string | undefined; text: string | undefined } | null; tutorialTimer: ReturnType<typeof setInterval> | null;
  tutorialTrace: TutorialTrace | null; tutorialSave: { epoch: number; identity: number; fingerprint: string; verified: boolean } | null;
  tutorialExpected: BlockTree[] | null; tutorialInsertion: { parentId: string; body: string; index: number; step: string; epoch: number } | null;
  baseUiLevel: 'entry' | 'basic' | 'advanced'; meijinShownIn: number | null;
  UI_LEVEL_NAMES: { readonly [level: string]: string }; flushingEditor: boolean;
  // (the text area a number is being written for, from a choice of the help, and whether that help still holds)
  intentInputFocus: { textarea: HTMLTextAreaElement; current: () => boolean } | null;
  // (a press on the stage that keeps it under the pointer: the pointer, and the cleanup given when the press starts)
  shellPointer: { pointerId: number; cleanup?: () => void } | null;
  VIEW_NAMES: { readonly [mode: string]: string }; MODE_REFUSALS: { readonly [why: string]: string }; meijinProcedureId: string;
  pen: CanvasRenderingContext2D | null; stageStyle: HTMLStyleElement; stageZoom: number | null; visibleStageScale: number;
  // (the size the stage had when the run started, and where the page was scrolled)
  runStageMinimum: { width: number; height: number; left: number; top: number } | null; stageView: StageView; enlargedFrom: number | null | undefined;
  statusSerial: number; statusFlash: Animation | null; statusMessage: string; statusEmptyWorkHint: boolean; runStateWords: string;
  editorFailureStatus: string | null; MEIJIN_TARGET: Readonly<{ id: string; name: string; type: string }>;
  inspectorNodes: { node: Element; marker: Comment }[]; restoringSnapshot: boolean;
  // (開く or お手本を開く asked: what it opens, the work and the editors it was asked for, and whether it asks or chooses now)
  openRequest: { kind: 'file' | 'sample'; fingerprint: string; phase: 'confirmation' | 'selection' } | null;
  loseConfirm: ((answer: boolean) => void) | null; saveConfirm: ((answer: boolean) => void) | null;
  designRatioLocked: boolean; designResizeSmall: boolean | null; designHandlesShown: { key: string; small: boolean } | null;
  propHelpSerial: number; PROPERTY_REFUSALS: { readonly [message: string]: string };
  STANDARD_SPRITES: { readonly star: SpritePreset; readonly [preset: string]: SpritePreset | undefined };
  // (a value shown whole: its label and value, the item and the page shown)
  activeFailureId: number | null; valueView: { readonly label: string; readonly value: RuntimeValue | undefined; index: number; page: number } | null; codeLineMeasure: HTMLDivElement | null;
  // (the code's lines as wrapped: the text and the measure they were made for, each line's top and height; the height
  // of each line's text)
  codeLineLayout: { source: string; key: string; lines: { top: number; height: number }[]; height: number } | null;
  codeLineHeights: { key: string; heights: Map<string, number> };
  gutterMarks: { errors: readonly DiagnosticLike[]; notices: readonly DiagnosticLike[] };
  RUN_HINT_KEYS: { readonly [word: string]: string }; runHint: string;
  // (the notes of the work's check, each with the body it is in, and the text each body had when it was checked)
  noticeKey: string | null; noticeWanted: string | null; noticeList: (Diagnostic & { owner: string })[]; noticeTimer: ReturnType<typeof setTimeout> | 0;
  noticeSources: Map<string, string | null>; pointedNotices: string;
  signalNameCache: { key: string | null; names: { sent: string[]; received: string[]; unfilteredReceivers: number } };
  editorChecks: Map<string, Diagnostic[]>; editorCheckTimer: ReturnType<typeof setTimeout> | 0; hintPage: number; callableHintPage: number;
  composingEditors: WeakSet<HTMLTextAreaElement | HTMLInputElement>; hintGroups: Map<string, { label: string; advanced: boolean }>; HINT_SENSE_KINDS: Set<string>; HINT_DATA_KINDS: Set<string>;
  PAUSED_STATUS: string; questionCb: ((answer: string) => void) | null; exportBusy: boolean; exportGeneration: number;
  pauseSlotPressedAt: number; samplePreviewUrls: Map<string, string>; paintEditor: { open(): void; hasDrawing: () => boolean };
  storedUiLevel: string | null; storedEditorMode: string | null; PART_PLACES: string; partPressed: boolean;
}
// A colour being chosen for a part (openColorPicker): the part and its work, the field, the value it had and the one
// chosen (none: clear), its hue, saturation and value, whether the hex typed is wrong or still being made, and the press
// on the wheel (its pointer, and what was chosen and typed before it).
export interface ColorEdit {
  id: string; component: Component; project: Project; field: 'fg' | 'bg'; original: string | null; value: string | null;
  hsv: PickerHsv; invalid: boolean; composing: boolean;
  pointer: { id: number; hsv: PickerHsv; value: string | null; invalid: boolean; hex: string } | null;
}
// A colour as the picker shows it: its hue (0〜360), saturation and value (0〜1).
export interface PickerHsv { h: number; s: number; v: number }
// A part being made (addComponent): a part whose costumes are given after it is made.
export type PartDraft = Omit<Component, 'type' | 'costumes' | 'costumeId'> & { type: ComponentType; costumes?: Costume[]; costumeId?: string };
// A part a new キャラクター starts as (STANDARD_SPRITES): its name, its text or picture (a picture's id and size), and
// its colour.
export type SpritePreset = Readonly<{ name: string; value: string; fg: string; kind?: string; assetId?: string; w?: number; h?: number }>;
// Where a run is (sourceLocation): the part, the event and the body that runs, the source's key, the line and column of
// the sentence or of the mistake, where the sentence ends (not at a mistake), and the mistake.
export interface RunLocation {
  targetId: string; event: string; scriptId: string | null | undefined; key: string; line: number; column: number;
  endLine: number | null; endColumn: number | null; error: RuntimeError | null;
}
// The redraws the parts ask for (filled by 11-app-drawing.ts): the whole screen, or one of its parts.
export interface AppRedraw {
  all: () => void; appearance: () => void; bindingModeToggle: (binding: EditorBinding) => void; callable: () => void;
  callableHints: () => void; callableList: () => void; callableOptions: (selectedKey?: string) => void; colorPreview: () => void;
  components: () => void; dataModal: () => void; editor: () => void; editorBinding: (binding: EditorBinding) => void;
  entrySurface: () => void; executionLocation: (options?: { follow?: boolean }) => void; failureDetails: () => void;
  fullValue: () => void; hints: () => void; monitor: () => void; properties: () => void;
  resizePreview: (preview: Component) => void; runStrip: () => void; selectors: () => void;
  sourceOverview: () => void; tree: () => void; tutorialChoices: (step: TutorialStep) => void; tutorialPresentation: () => void;
}
// The application as the public API shows it (Akari.app, made by initApp): the editors as they are now (where the body is
// kept, the sessions, the made block being written, how far the history goes, the state of the run, whether the work
// changed), the work and its store, and the calls to read, run, stop, diagnose and export the work.
export interface AkariApp {
  readonly editorState: {
    sourceOverviewOpen: boolean; selectedScriptId: string | null; sourceRegistry: Pick<SourceRecord, 'key' | 'ownerId'>[];
    main: EditorSession | null; draft: EditorSession | null; callableDraft: CallableDraft; hasDraft: boolean;
    history: number; redo: number; state: AppVars['appState']; dirty: boolean; contextRevision: number;
  };
  readonly project: Project; readonly assetStore: AssetStore;
  compile: () => CompiledProject; startRun: () => void; stopRun: () => void; showDiagnosis: () => void; exportProject: () => void;
}
// What a change of the blocks makes of a session (prepareBlockEdit): its new parts, or a draft with a hole the child still
// fills; each form read for the fields of the other (none).
export type BlockEditResult = Readable<ReturnType<typeof prepareBlockEdit>>;
// A row of the properties (propRow): its step, what follows a change, and the help under it.
export interface PropRowOptions { step?: string; after?: () => void; help?: string }
// A row of the properties: a checkbox's gives its check, another row (a text, a number or one that is only read) the
// text in its box.
export interface PropRow {
  (name: string, value: boolean, onchange: (v: boolean) => void, type: 'checkbox', options?: PropRowOptions): HTMLDivElement;
  (name: string, value: string | number | null | undefined, onchange: (v: string) => void, type?: 'text' | 'number' | 'readonly', options?: PropRowOptions): HTMLDivElement;
}
// What the application throws for a refused change: an error, with the code of a mistake of the work.
export type ThrownError = Error & { code?: string };
// What ends a drag on the stage: a pointer's event, or an event only named (a blur, an escape, a cancel).
export interface DragEnd { readonly type: string; readonly pointerId?: number }
// The context an editor's source is read in (bindingContext): the source's key, the context of a part's body, of a
// made block (its draft while it is written) or of the 名人 text, and the level of the editor.
export type AppContext = EditorContext & { ownerKey: string; targetId: string | null; draft?: boolean; level?: string };
// A mistake as the application shows it: a mistake of a check, with the source its line numbers count in.
export type ShownDiagnostic = DiagnosticLike & { source?: string };
// A mistake the application throws for a source that does not read (sourceCandidate): the mistakes found, the
// proposals and choices offered, and the source the proposals are made for.
export type AppError = InstanceType<typeof AkariError> & { diagnostics?: Diagnostic[]; proposalSource?: string };
// The words an editor is told to say when nothing was thrown (showEditorFailure): a text, which reads none of the fields
// of a mistake (each is undefined).
export type FailureWords = String & { readonly [K in keyof AppError]?: undefined };
// What an editor is told failed: a mistake thrown, or the words to say.
export type EditorFailure = AppError | FailureWords;
// An element of the page found among several (the $$ of the application): an element of HTML, a control that may be
// disabled.
export type PageControl = HTMLElement & { disabled?: boolean };
// What the application is doing: designing, taking in a picture or sound, getting a run ready, running, or paused.
export type AppState = 'DESIGN' | 'IMPORTING' | 'PREPARING' | 'RUNNING' | 'PAUSED';
// A record this computer kept of the work (readAutosave), as it is read back: checked by the one who restores it
// (checkRecovery). A value read back that is no object has none of these parts, and the check refuses it.
export type KeptRecord = { readonly updatedAt?: unknown; readonly [key: string]: unknown };
// What this computer keeps of the work (writeAutosave): the one record, its form, when and in which generation it was
// written, the history of the work and the editors, and the fingerprints of what was last saved to a file.
export interface AutosaveRecord {
  id: 'latest'; version: 2; updatedAt: number; revision: number; workspace: SavedWorkspaceHistory;
  lastSavedFingerprint: string; lastSavedEditorFingerprint: string;
}
// The editors' state restored (restoreEditorState): as kept (a state of the history keeps basic or advanced:
// keptUiLevel), or with the level shown now laid over it, which may be はじめて (restoreSnap without restoreView).
export type RestoredEditorState = Omit<EditorState, 'uiLevel'> & { uiLevel: EditorState['uiLevel'] | 'entry' };
// A kept record offered to be restored (checkRecovery): the record as it was read and checked, and its history decoded.
export type RecoveryData = KeptRecord & { restored: Awaited<ReturnType<typeof decodeWorkspaceHistory>> };
// What stops a thing from being taken away or renamed (showResourceImpact): the thing, and the uses found or not sure.
export interface ResourceImpact { resource: { name: string }; references: { title: string; line: number; reason?: string }[]; uncertain: { title: string; line: number; reason?: string }[] }
// When a body runs, as its heading says (scriptMetadataFromHeading): its part, its event and the filter of the event.
export type ScriptMetadata = ReturnType<typeof scriptMetadataFromHeading>;
// A body of the work a source taken in is compared with (sourceImportPlan): the body, the text of one of its units, when
// that unit runs and its sentences (none for a body that does not read).
export interface ImportCandidate { row: ProjectScript; text: string; metadata: ScriptMetadata; body: readonly Statement[] | null }
// What a source taken in is made into (sourceImportPlan): the source and whose it is, its context, a body for each unit
// (its text, when it runs, the bodies of the work it meets, whether it reads alone and whether it is the body it meets),
// whether it meets bodies of the work, whether it can be taken in as it is, into the body shown, or as separate bodies,
// and the fingerprint of the work it was made for.
export interface SourceImportPlan {
  source: string; ownerKey: string; context: AppContext;
  entries: { text: string; metadata: ScriptMetadata; candidates: ImportCandidate[]; independent: boolean; equal: boolean }[];
  hasExisting: boolean; safe: boolean; canEditCurrent: boolean; canSplit: boolean; projectFingerprint: string;
}
// The calls 11-app-tools-core.ts offers the parts after it.
export interface AppToolsCoreCalls {
  // The page's element for a written selector (src/types/page.d.ts), and the elements a selector finds.
  $: PageFinder; $$: (selector: string) => PageControl[];
  // The work and its parts: the ids used, a part, a target and its type, the 名人 texts, whether the work runs.
  allIds: () => Set<string>; ensureUniqueId: (prefix: string, ids?: Set<string>) => string;
  componentById: (id: string | null | undefined) => Component | undefined;
  targetById: (id: string | null | undefined) => Stage | AppVars['MEIJIN_TARGET'] | Component | undefined;
  targetType: (id: string | null | undefined) => ComponentType | 'stage' | 'meijin' | undefined; meijinScripts: () => MeijinScript[];
  meijinTextLabel: (script: ProjectScript | null | undefined) => string | null; workIsMeijin: () => boolean;
  currentIsMeijin: () => boolean; modelLocked: () => boolean; waitsForExtension: (item: SyntaxItem) => boolean;
  signalName: (item: { filter?: EventFilter | string | null }) => string;
  newBodyFilter: (event: string) => { filter: { target: string } } | { filter?: undefined };
  // The editors: the view chosen and shown, the level kept, who owns an editor, its source, context and a source tried,
  // what is still being written, and the help offered for a sentence that does not read.
  chosenEditorMode: (kind?: string, fallback?: 'code' | 'blocks') => 'code' | 'blocks'; shownEditorMode: () => 'code' | 'blocks';
  draftOwner: () => string; bindingOwner: (binding: EditorBinding) => string;
  readSource: (binding: EditorBinding, ownerKey?: string) => string; bindingContext: (binding: EditorBinding) => AppContext;
  sourceCandidate: (binding: EditorBinding, ownerKey: string, source: string) => Project | null;
  formatKeepingMeaning: (binding: EditorBinding, ast: Script) => string | null;
  hasPendingEditor: () => boolean; composingAny: () => boolean; unsavedDraft: () => boolean; textTooLong: () => boolean; captureEditorView: (binding: EditorBinding) => void;
  captureEditorState: () => EditorState; cancelAssist: (binding: EditorBinding) => void; closeAssist: (binding: EditorBinding) => void;
  assistEligible: (binding: EditorBinding, error: EditorFailure | null | undefined) => boolean | 0 | undefined;
  modeBlockedNote: (binding: EditorBinding) => HTMLElement; showBlockedNote: (note: HTMLElement) => void;
  hintGroup: (h: Hint, symbols: Symbols) => { label: string; advanced: boolean } | null | undefined;
  wrappedCodeLines: () => NonNullable<AppVars['codeLineLayout']>;
  // The made block being written: checked, kept, its signature, whether it changed, and the 名人 procedure shown.
  validateCallableDraft: (d: CallableDraft | null | undefined) => CallableDraft | null;
  callableSignature: () => string; hasCallableDraft: () => boolean; hideMeijinProcedure: () => void;
  callableDraftNotice: (then: string) => string;
  // Mistakes: whose source, where, the sentence and the source a mistake's lines count in, and a sentence's end.
  diagnosticOwner: (diagnostic: ShownDiagnostic | null | undefined) => { key: string; item: SyntaxItem | undefined; script: ProjectScript | null; definition: ActionDefinitionData | FunctionDefinitionData | undefined };
  diagnosticLocation: (diagnostic: ShownDiagnostic | null | undefined, options?: { blocks?: boolean }) => string;
  diagnosticSentence: (diagnostic: ShownDiagnostic | null | undefined) => string;
  diagnosticSource: (diagnostic: ShownDiagnostic | null | undefined) => string | null; sentence: (text: string) => string;
  // The status line and the log; the stage's zoom; the runtime inspector closed; a sound previewed stopped.
  log: (m: unknown, type?: string) => void; setStatus: (m: string | null | undefined, emptyWorkHint?: boolean) => void;
  setStageZoom: (scale: number | null) => void; closeRuntimeInspector: () => void; stopPreview: () => void;
  // The history and the fingerprints, whether anything is unsaved, and the editors' state saved with the work.
  currentFingerprint: () => string; stateFingerprintCore: (fingerprint?: string) => string;
  snapshot: (fingerprint?: string, stateFingerprint?: string) => AppSnapshot; pushHistoryNow: (e?: AppSnapshot) => void;
  dropHistoryTimer: () => void; updateDirty: () => void; openEditorFingerprint: () => string;
  validateSavedEditorFingerprint: (value: unknown) => string;
  // The handles on the design stage and the help under it.
  designHandlesSmall: (c: Component) => boolean; designHandleKey: (c: Component) => string;
  designHandlesSmallShown: (c: Component) => boolean; updateDesignHelp: (c?: Component | null) => void;
  designBox: (c: Pick<Component, 'x' | 'y' | 'w' | 'h' | 'direction' | 'scalePercent'>) => { left: number; right: number; bottom: number; top: number };
  // The guide: a step confirmed, a block put where it asks, what may be pressed and where the keys go first.
  confirmTutorialOperation: (action?: string | null) => void; tutorialInsertionReady: (step?: TutorialStep | null) => boolean;
  tutorialElementAllowed: (element: EventTarget | null) => boolean; tutorialFocusTargets: () => PageControl[];
  focusTutorialTarget: () => void;
  // What this computer keeps of the work, the 開く button shown, and the drafts and uses a rename looks at.
  openAutosaveDB: () => Promise<IDBDatabase>; autosaveTransaction: (db: IDBDatabase, operation: (store: IDBObjectStore) => void) => Promise<void>;
  readAutosave: () => Promise<KeptRecord | null>; openButtonShown: () => HTMLElement | null;
  resourceDraftRecords: () => DraftRecord[]; showResourceImpact: (impact: ResourceImpact, root: HTMLElement, action?: string) => void;
}
// The calls 11-app-drawing.ts offers the application (initApp): the drawings it also asks for by name.
export interface AppDrawingCalls {
  renderAll: () => void; renderEntrySurface: () => void; refreshTutorialPresentation: () => void; refreshEditor: () => void;
  renderEditorBinding: (binding: EditorBinding) => void; paintBindingModeToggle: (binding: EditorBinding) => void;
  renderSelectors: () => void; renderSourceOverview: () => void; renderHints: () => void; renderMonitor: () => void;
  renderAppearance: () => void; renderDataModal: () => void; renderFailureDetails: () => void; renderFullValue: () => void;
  renderCallableHints: () => void; renderCallableList: (prefer?: string) => void;
}
// The calls 11-app-commands.ts offers the parts after it.
export interface AppCommandsCalls {
  // The guide: begun, its event chosen, its place for a block, its choice, its save checked, and the events it lets
  // through.
  beginTutorial: () => Promise<void>; selectEntryEvent: (event: EventName) => void; selectTutorialInsertion: (location: InsertLocation) => void;
  tutorialChoose: (key: string) => void; verifyTutorialSave: (file: File | null | undefined) => Promise<void>;
  tutorialCapture: (event: Event & Partial<Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'repeat' | 'isComposing'>>) => void;
  // The editors: a change of the blocks, the code saved and formatted, a hint put in, the 名人 text begun, a list repaired.
  operateBlock: (binding: EditorBinding, operation: ViewOperation) => OperationAnswer;
  saveEditor: (options?: { fromInput?: boolean }) => boolean; formatCurrent: () => void; insertHint: (h: Hint) => void;
  startMeijin: () => void; openQuotedListRepair: (record: ErrorRecord) => void;
  // The 名人 text's procedures: renamed, and opened at their place.
  renameMeijinProcedure: () => void; openMeijinProcedure: () => void;
  // The page: the editor's shell and the colour picker set up, a property's row and a colour's setting.
  installEditorShell: () => void; installColorPicker: () => void; propRow: PropRow;
  colorSetting: (c: Component, field: 'fg' | 'bg', label: string) => HTMLDivElement;
  // The parts: dragged, resized, copied, taken away; backdrops, costumes, data and pictures and sounds added.
  startDrag: (ev: PointerEvent, id: string) => void; startResize: (ev: PointerEvent, id: string, direction?: string) => void;
  duplicateSelectedComponent: () => void; deleteSelectedComponent: () => void;
  addBackdrop: () => void; addCostume: () => void; addData: () => void;
  importImageObject: (file: File | null | undefined, options?: { nativeSize?: boolean; onError?: (e: unknown) => void }) => Promise<boolean | undefined>;
  importBackdropImage: (file: File | null | undefined) => Promise<boolean | undefined>;
  importCostumeImage: (file: File | null | undefined) => Promise<boolean | undefined>;
  importSoundFile: (file: File | null | undefined) => Promise<boolean | undefined>;
  // The made blocks: the header followed, formatted, saved, taken away, and an unsaved change given up.
  updateCallableHeader: () => void; formatCallable: () => void; saveCallable: () => void; deleteCallable: () => void;
  confirmCallableDiscard: () => boolean;
  // The work: undone and redone, a new one, opened, saved, made a player file.
  undo: () => void; redoDo: () => void; startProject: () => Promise<void>; requestOpenProject: () => void;
  openProject: (file: File, approval?: AppVars['openRequest']) => Promise<void>; requestSave: () => Promise<boolean>;
  exportProject: () => void; downloadProject: (presentation: string) => void;
  // A run: started, looked into, and a value shown whole.
  startRun: () => void; openRuntimeInspector: () => void; showFullValue: (label: string, value: RuntimeValue | undefined) => void;
}
// The mistakes of an editor's code as the check finds them (checkedEditorErrors): the mistakes, and for a body with its
// own heading none until its check is done.
export interface CheckedEditorErrors {
  (binding: EditorBinding, source: string, errs: Diagnostic[]): Diagnostic[];
  (binding: EditorBinding, source: string, errs: Diagnostic[], headingAst: Script | null): Diagnostic[] | null;
}
// The calls 11-app-services.ts offers the parts after it.
export interface AppServicesCalls {
  // The level shown and the guide: refreshed and finished.
  applyUiLevel: (shown?: 'code' | 'blocks' | null) => boolean; tutorialRefresh: () => void; finishTutorial: (completed?: boolean) => void;
  // The editors: a source taken into the work, a code saved, an editor's change taken in (or the one in front), the view
  // switched, a change cancelled, a failure shown, the mistakes of a code checked, the notices of a body, the editor
  // shown again, the shell laid out for a view and the press that keeps the stage released.
  commitSource: (binding: EditorBinding, source: string, options?: { atomic?: boolean; flushQueued?: boolean }) => boolean;
  saveCodeBinding: (binding: EditorBinding, options?: { fromInput?: boolean }) => boolean;
  flushEditor: (binding: EditorBinding, options?: { preserveView?: boolean }) => boolean;
  flushActiveEditor: (options?: { preserveView?: boolean }) => boolean;
  switchEditorMode: (binding: EditorBinding, mode: 'code' | 'blocks') => boolean; cancelEditorPending: (binding: EditorBinding) => void;
  showEditorFailure: (binding: EditorBinding, error: EditorFailure, options?: { preservePending?: boolean }) => boolean;
  checkedEditorErrors: CheckedEditorErrors;
  bodyNotices: (session: EditorSession | null) => (Diagnostic & { owner: string })[];
  loadEditor: () => void; syncEditorShell: (mode: 'code' | 'blocks') => void; releaseShellPointer: () => void;
  // The made block being written: its form read, cleared, loaded and restored.
  syncCallableDraft: () => boolean; clearCallable: (type?: CallableDraft['type']) => void; loadCallable: (v: string) => void;
  // The work: marked changed, kept on this computer, a state of the history restored and the editors' state, a design
  // change rolled back, a notice's fix, the check of the work, the list of all bodies shown.
  markDirty: () => void; scheduleAutosave: () => void; writeAutosave: () => Promise<boolean | void>;
  restoreSnap: (e: HistoryState, options?: { restoreView?: boolean }) => void; restoreEditorState: (state: RestoredEditorState) => void;
  rollbackDesign: (before: Project) => void; applyNoteProposal: (note: Diagnostic, proposal: Proposal) => void;
  showDiagnosis: () => void; showSourceOverview: () => void;
  // Opening another work: what would be lost, the questions before it, the request, a sample and the work replaced.
  currentOpenState: () => { fingerprint: string; unsaved: boolean }; askLose: (observed?: { fingerprint: string; unsaved: boolean }) => Promise<boolean>;
  askSaveName: () => Promise<boolean>; confirmOpenRequest: (kind: 'file' | 'sample') => Promise<void>; requestSampleProject: () => void;
  replaceCurrentProject: (nextProject: Project, nextAssets: AssetStore, targetId: string, event: EventName, status: string, emptyWorkHint?: boolean) => void;
  // The parts: one chosen, added, resized, its colours (chosen, the picker), pictures and sounds taken in.
  selectObject: (id: string) => boolean;
  addComponent: (type: ComponentType, x?: number | null, y?: number | null, spritePreset?: string) => void;
  commitResize: (c: Component, next: Partial<Pick<Component, 'x' | 'y' | 'w' | 'h' | 'scalePercent'>>) => boolean;
  commitColor: (c: Component, field: 'fg' | 'bg', value: string | null) => boolean; choosePreset: (c: Component, field: 'fg' | 'bg', value: string | null) => void;
  openColorPicker: (c: Component, field: 'fg' | 'bg', label: string) => void; closeColorPicker: () => void;
  syncColorPicker: (syncHex?: boolean) => void; updatePickerHsv: (hsv: Partial<PickerHsv>) => void;
  finishAssetCommit: (nextProject: Project, nextStore: AssetStore, message: string) => void;
  // Stopping a run (■ 止める).
  stopRun: () => void;
}
// The calls 11-app-run.ts offers the parts after it: taking in a picture or sound (the controls locked meanwhile), and
// a run: the screen it draws on, its painting, its state, and the failure shown.
export interface AppRunCalls {
  runAssetImport: (label: string, work: () => Promise<unknown>, onError?: (e: unknown) => void) => Promise<boolean | undefined>;
  bridge: () => RuntimeUi; flushRuntimePaint: () => void; updateRunState: () => void;
  showFailureDetails: (id?: number | null) => void;
}
// The calls 11-app-tools.ts offers the parts after it.
export interface AppToolsCalls {
  // The guide: the body it shows, what may be changed, its place kept in view, its marks cleared, what a run it asked
  // for did, and what it has seen.
  tutorialBody: () => BlockTree[]; tutorialOperationAllowed: (binding: EditorBinding, operation: ViewOperation) => boolean;
  keepTutorialTargetInView: () => void; clearTutorialPresentation: () => void;
  tutorialRecordStatement: (task: Task, node: { readonly kind: string; readonly op?: string }, epoch: number | undefined, generation: number) => void;
  tutorialCollectRuntime: () => void; tutorialFacts: () => TutorialFacts;
  // The editors: the session of one, made again when its source or context changed; the context changed; the levels a
  // view offers; why a view is refused, its note and the view remembered; a check waiting; the help kept for a mistake;
  // a mistake shown and cleared; a source taken in and the choice it waits for.
  getEditorSession: (binding: EditorBinding, options?: { force?: boolean }) => EditorSession; invalidateEditors: () => void;
  uiLevelChoices: (view?: 'code' | 'blocks') => string[];
  modeRefusal: (binding: EditorBinding, shown: 'code' | 'blocks', codeError?: boolean) => 'busy' | 'entry' | 'meijin' | 'error' | null;
  headingBlockedNote: () => HTMLElement; showModeBlockedNote: (binding: EditorBinding) => void;
  rememberEditorMode: (kind: string, mode: 'code' | 'blocks') => void; editorCheckScheduled: (binding: EditorBinding, source: string) => boolean;
  stashAssist: (binding: EditorBinding, error: EditorFailure) => boolean; clearEditorFailure: (binding: EditorBinding) => void;
  showDiagnosticMessage: (root: HTMLElement, diagnostic: DiagnosticLike | null | undefined, location?: string, original?: string | null, source?: string | null, options?: { listItem?: boolean }) => void;
  fixPointer: (diagnostic: ShownDiagnostic | null | undefined) => string; meijinFormError: (owner: string, source: string, errs: Diagnostic[]) => Diagnostic[];
  sourceImportPlan: (binding: EditorBinding, source: string) => SourceImportPlan | null; hideSourceImport: () => void; sourceImportChoice: () => string;
  // The bodies: the one chosen, the events of a part, the list of all bodies closed, a 名人 heading, a 名人 procedure shown.
  selectCurrentScript: () => ProjectScript | undefined; eventsFor: (id: string | null | undefined) => EventName[];
  hideSourceOverview: () => void; meijinHeadingSource: (heading: Heading | UnfilteredHeading, name: string) => string; showMeijinProcedure: (id: string) => boolean;
  // The page: the toolbar's menus, the padding under the properties, dialogs that keep the focus, a dialog closed, the
  // work's name over its box, the status of an empty work.
  installToolbarMenus: (toolbar: HTMLElement) => void; syncPropertyScrollPadding: () => void; setupModalAccessibility: () => void;
  closeEditingModals: () => void; placeProjectNameText: () => void; emptyProjectStatus: () => string;
  // The stage: drawn, its size while it runs, enlarged and the page around it inert, the pictures' addresses, the
  // progress of reading pictures and sounds, and the run's world cleared.
  applyStage: () => void; fitRunStageMinimum: () => void; setStageEnlarged: (on: boolean) => void; syncWideInert: () => void;
  designImageUrl: (id: string) => string; revokeDesignUrls: () => void; compactCurrentAssets: () => void;
  setAssetProgress: (text?: string) => void; disposeRuntime: () => void;
  // The parts on the design stage: how far a press moves, the resize handles and their focus, a name checked, a new part's
  // place, the parts left outside, a direction kept in 0〜360, a section of the properties and a colour's chip.
  pointerSlop: (e: PointerEvent) => number; positionResizeHandles: (c?: Component | null) => void;
  focusResizeHandle: (id: string, direction: string) => void; checkPartName: (v: string, options?: { stage?: boolean }) => void;
  newPartPlace: (components: readonly Component[], stage: Pick<Stage, 'width' | 'height'>, w: number, h: number, start: { x: number; y: number }) => { x: number; y: number };
  noteOutsideParts: () => void; designDirection: (value: unknown) => number;
  propSection: (title: string, ...rows: (Node | string)[]) => HTMLElement; colorChip: (node: HTMLElement, value: string | null) => void;
  // The history: made again from the work, and a state queued.
  resetHistory: () => void; queueHistory: (fingerprint?: string, stateFingerprint?: string) => void;
  // A run: what a flow does, a value as the monitor shows it, the code's line numbers, where a run is and its sentence
  // and body, the hint of how to go on, the notices when it stops, a call that may fail, and the words of its state.
  taskStateText: (task: Task) => string; monitorValue: (value: RuntimeValue | undefined) => string;
  updateGutter: (errors?: readonly DiagnosticLike[], notices?: readonly DiagnosticLike[]) => void;
  sourceLocation: (task: Task, node: Statement | null, error?: RuntimeError | null) => RunLocation;
  runningSentence: (source: string | null | undefined, loc: RunLocation) => string; runningScript: (scriptKey: string) => ProjectScript | null;
  runtimeEventText: (eventType: string, scriptKey?: string | null) => string; restartHint: () => string; showRunHint: (text: string) => void;
  noticeSourceOf: (owner: string) => string | null; stopStatusWithNotices: () => string;
  dispatchRuntime: <T>(fn: () => T) => T | undefined; runStateText: () => string;
  // A list a failure names in 「」 (a list repaired): where it is written, and the lists it may mean.
  quotedListRepair: (record: ErrorRecord) => { start: number; end: number; original: string } | null;
  quotedListCandidates: (record: ErrorRecord) => { id: string; owner: string | undefined; label: string; source: string }[];
  // The question of a run, the ⏸ and ▶ つづける slot, and ↶ ↷.
  limitInputValue: (input: HTMLInputElement) => string; showQuestion: (q: string, cb: (answer: string) => void) => void; hideQuestion: () => void;
  pauseSlotPress: (event: MouseEvent) => boolean; historyPress: (action: () => void, other: HTMLButtonElement) => (event: MouseEvent) => void;
  // Hints: drawn with a search and a page.
  drawHints: (root: HTMLElement, candidates: Hint[], search: string, offset: number, insert: (h: Hint) => void) => { page: number; total: number; pages: number };
  // Files: the player file written and its export stopped, a file refused, the file chosen to open, a file's name as a
  // name in the work, a sample's picture.
  writePlayerFile: (presentation: string, button: HTMLButtonElement) => void; cancelPlayerExport: () => void;
  showOpenRefusal: (error: (Error & { otherFormat?: boolean }) | null | undefined) => void; closeOpenRefusal: () => void;
  finishOpenSelection: () => void; fileStemCandidate: (file: Pick<File, 'name'>, names: ReadonlySet<string>, options?: { part?: boolean }) => string;
  fillSamplePicture: (picture: Element, id: string) => void;
  // What this computer keeps of the work: cleared, and offered back.
  clearAutosave: () => Promise<boolean | void>; checkRecovery: (options?: { hold?: (held: boolean) => void; found?: (kept: boolean) => void }) => Promise<void>;
  // The data form, the made block read from its form, a thing taken away only with no uses, and a sound tried.
  clearDataFormError: () => void; showDataFormError: (error: Error & { code?: unknown }, field: HTMLElement | null | undefined) => void;
  updateDataForm: () => void;
  readCallableDraft: () => Pick<CallableDraft, 'ownerId' | 'type' | 'name' | 'source' | 'editId' | 'callPhrase'> & { args: string[] };
  allowResourceDelete: (key: string, root: HTMLElement, removedOwner?: string | null) => boolean;
  previewSound: (snd: Pick<Sound, 'assetId'>) => Promise<void>;
}
