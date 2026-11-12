// The block editor view (createBlockEditorView, 10-block-view.ts, and its parts 10-view-base.ts, 10-view-editing.ts and
// 10-view-drawing.ts): what it is made with, the state it shares with its parts, and the calls each part offers the
// parts after it. Types only; the product holds none of this.
import type { BlockIndexEntry, BlockOperation, BlockSchema, BlockTree, InputItem, InsertionAvailability, InsertLocation, SchemaItem } from './blocks.d.ts';
import type { Diagnostic, Symbols } from './compiled.d.ts';
import type { EditorContext, EditorSession, PendingEdit, SearchCandidate, SelectedBody } from './editor.d.ts';
import type { EventFilter, Project } from './project.d.ts';
import type { ParseContext } from './parse.d.ts';
import type { Proposal } from './runtime.d.ts';
import type { Readable, Unit } from './syntax-base.d.ts';

// A place to show (the running or failing place, highlight): its line and column in the source, the source's key,
// whether it is a mistake's, and the block and the body when they are known.
// (a line not known is none; error: a mistake is there, any value read as whether it is)
export interface ViewPlace { line?: number | null; column?: number; key?: string; error?: unknown; id?: string | null; body?: string | null }
// A place in a body (the other places are in inputs).
export type BodyPlace = Extract<InsertLocation, { body: string }>;
export type InputPlace = Extract<InsertLocation, { input: string }>;
// A box on the screen, from its corners.
export interface ScreenBox { left: number; right: number; top: number; bottom: number }
// What the host answers to a change of the blocks (onOperation): whether it was taken in and changed the source, the
// mistake or the words why not, and, when the source the view showed was given another key, that key's change. A
// promise is no answer (the view refuses one).
export interface OperationAnswer {
  // (draftOnly: the change left a draft with a hole)
  ok: boolean; changed?: boolean; draftOnly?: boolean; error?: unknown; reason?: string; ownerTransition?: { from: string; to: string };
  then?: unknown;
  // (the view's own answer: a field is still being typed)
  pending?: boolean;
}
// A change of the blocks the view asks of the host: a block operation, and for a heading changed without its body the
// note that the body stays (preserveBody).
export type ViewOperation = BlockOperation & { preserveBody?: boolean };
// What the view tells the host of the field being typed or the block being carried (onPending): the source and its
// generations, the block and its path, the field, the text typed, whether a word is being made with an IME or the
// text does not read, and the words to show; or only the source and the words, while a block is carried or put back.
// A field typed in a group of controls tells what the group reads (StructuredInput: PendingEdit's value).
export type PendingNotice = Omit<PendingEdit, 'kind'>;
// The view's context: the editor's as the reader reads it (with the names made in the source), and the names of the
// work's signals (a call, as the host keeps them).
export type ViewContext = EditorContext & Pick<ParseContext, 'symbols' | 'localNames' | 'binders'> & { signalNames?: () => { sent: string[]; received: string[] } };
// What the view is made with: where it is drawn, the session, the work and the context it shows, whether the work is
// locked (running), the host's answer to a change, what it is told of a field being typed and of a cancel; a view
// that only shows; the button that widens the workspace (it answers whether the workspace is wide now), the free
// room above the workspace for the floating controls, a notice's rewrite, the tutorial's calls, and the button that
// makes a variable or a list.
export interface BlockViewOptions {
  root: HTMLElement; getSession: () => EditorSession | null | undefined; getProject: () => Project;
  getContext?: () => ViewContext; isLocked?: () => boolean; onOperation: (operation: ViewOperation) => OperationAnswer | boolean;
  onPending?: (pending: PendingNotice | null) => void; onCancel?: () => void; readOnly?: boolean;
  onExpand?: (() => boolean) | null; controlsSpace?: (() => ScreenBox | null) | null;
  onNoteProposal?: (note: Diagnostic, proposal: Proposal) => unknown;
  tutorialActive?: () => boolean; onDestinationSelected?: (location: InsertLocation) => void; onPresentation?: () => void;
  lessonCandidate?: () => { key: string; node: BlockTree; label: string } | null; onData?: () => void;
}
// A block element carrying what the list made for it (a candidate from the search).
export type BlockElement = HTMLElement & { _akariSearchCandidate?: SearchCandidate };
// A field whose value is made of parts (who does it, a heading, the names of the arguments: fieldControl): a group of
// controls typed in as one control; its value is what the controls read (a subject, a heading, the names, or nothing).
export type StructuredInput = HTMLFieldSetElement & { value: StructuredValue };
// What a field made of parts holds: who does it, a heading, the names of the arguments, or nothing (no heading, the
// arguments handed over as written).
export type StructuredValue = ActorChoice | HeadingChoice | string[] | undefined;
// The control a field of a block is typed in: a text box, a text area, a choice, or a group of controls.
export type FieldInput = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | StructuredInput;
// What the controls of who does it read (fieldControl): the kind and the name as chosen, and が when it is chosen; and
// a heading as its controls read it. The edit reads them when it is put in.
export type ActorChoice = { kind: string; name?: string; particle?: string };
export type HeadingChoice = { event: string; actorRef: ActorChoice; filter?: EventFilter | null };

// The field being typed (pending): its input, its block and the field's key, whether it is a memo, the source and its
// generations it was opened on, the value it had, whether a word is being made, how it is read, its mistake, whether
// it does not read, and the mistake shown under it with the value it was shown for.
export interface PendingField {
  input: FieldInput; id: string; key: string; field: { key: string; type?: string };
  annotation: boolean; ownerKey: string | undefined; sourceRevision: number | undefined; contextRevision: number | undefined;
  original: unknown; composing: boolean; read: () => unknown; error: string; invalid: boolean; shown: boolean | undefined;
  shownValue: unknown;
}
// A press that carries a block once it moves (drag): its pointer, the element pressed, the block (or the list's
// schema and candidate), whether the blocks after it go too, where it started, whether it has moved or been held,
// the source and generations it was pressed on, the place it would go and whether that place takes it, and the timer
// that lifts it when held; once it is carried, where in it the pointer holds it, the element drawn for it and the
// blocks carried (beginGhost), and the place under the pointer (target).
export interface DragState {
  pointerId: number; pointerType: string; element: BlockElement; id: string | undefined; schemaId: string | undefined;
  run: boolean; candidate: SearchCandidate | undefined; startX: number; startY: number; started: boolean; held: boolean;
  owner: string | undefined; revision: number | undefined; contextRevision: number | undefined;
  location: InsertLocation | null; valid: boolean; holdTimer?: ReturnType<typeof setTimeout>;
  grabX?: number; grabY?: number; visual?: HTMLElement; parts?: HTMLElement[]; target?: HTMLElement | null;
  // As it is carried (previewDrag, scrollDrag): the pointer's place, whether it is over the block list (where letting
  // go deletes it), the blocks it would take in, the words said for the place, when the edge last scrolled, and whether
  // the pointer has gone far enough from the press for the edges to scroll.
  clientX?: number; clientY?: number; deleteZone?: boolean; wraps?: number; reason?: string; scrollTime?: number; edgeArmed?: boolean;
}
// A pointer's place on the screen (a pointer event, or a carried block's last place).
export interface ScreenPoint { clientX: number; clientY: number }
// The element that has the focus, as the drawing reads it again after drawing: its data, and its selection when it is
// a text box or a text area.
export type FocusedElement = Element & { dataset?: DOMStringMap } & Partial<Pick<HTMLInputElement, 'selectionStart' | 'selectionEnd' | 'selectionDirection'>>;
// What a block is carried by (data-blockui-drag): its words, or its handle, a button that may be disabled.
export type BlockHandle = HTMLElement & { disabled?: boolean };
// A control's disabled set from a truth that may be undefined (a view made without readOnly): the element reads
// undefined as false (as DataWrites, view.d.ts).
export type DisabledWrites = { disabled: boolean | undefined };
// A control in a placed block a press starts on (controlPress): it may be disabled, and a choice can open its list.
export type PressedControl = HTMLElement & { disabled?: boolean; showPicker?: () => void };
// A pointer that may start moving the workspace (pendingPan) and the move under way (pan), a pinch, and a press on a
// control inside a block (controlPress).
// (a move under way also notes whether it started on the empty workspace and whether it has moved)
export interface PendingPan {
  id: number; x: number; y: number; left: number; top: number; handle?: HTMLElement | null; holdTimer?: ReturnType<typeof setTimeout>;
  blank?: boolean; moved?: boolean;
}
export interface ViewPoint { x: number; y: number }

// The state the view shares with its parts, assigned by createBlockEditorView at its top level. The calls it makes while
// it assigns it (E, button, listen, and render at its end) read only what is assigned already (a browser run with the
// bag as a Proxy found no other read: FILLED_BAGS).
export interface ViewVars {
  // (the view's document is shown in a window)
  options: BlockViewOptions; root: HTMLElement; doc: Document & { readonly defaultView: WindowProxy & typeof globalThis }; viewId: string; abort: AbortController; signal: AbortSignal;
  getSession: BlockViewOptions['getSession']; getProject: BlockViewOptions['getProject'];
  getContext: () => ViewContext; isLocked: () => boolean; onOperation: BlockViewOptions['onOperation'];
  onPending: (pending: PendingNotice | null) => void; onCancel: () => void;
  pending: PendingField | null; deferredFocus: Element | null; deferredRender: boolean; committing: boolean;
  rendering: boolean; destroyed: boolean; signature: string; textKey: string;
  tree: BlockTree | null; index: Map<string, BlockIndexEntry>; selected: string;
  destination: InsertLocation | null; moving: { id: string; type: string } | null; drag: DragState | null;
  replacement: { sourceId: string; location: InsertLocation } | null; currentLocation: ViewPlace | null | undefined;
  suppressClickUntil: number; pointerFocusTarget: EventTarget | null; pointerFocusPrevious: Element | null;
  lastPointerType: string; highlightedId: string | null; lineNodes: Map<number, string>;
  displaySession: EditorSession | null; dragFrame: number | null;
  searchText: string; previousSearch: string; category: string; showOutside: boolean; paletteMode: string;
  categoryExplicit: boolean; availabilityCache: Map<string, ViewAvailability>; cacheSignature: string; diagnosticPage: number;
  diagnosticsOpen: boolean; diagnosticsByLine: Map<number, Diagnostic[]>; noticesByLine: Map<number, Diagnostic[]>;
  branchLines: Map<number, { id: string; body: string }>; branchSourceLines: Map<string, number>;
  phraseCache: Map<string, PhrasePart[] | null>; PALETTE_GROUP_LABELS: Map<string, string>;
  faceSymbols: { work: Project; symbols: Symbols } | null; openEditors: Set<string>; openAnnotations: Set<string>;
  collapsed: Set<string>; bodyPages: Map<string, number>; bodyExtraPages: Map<string, Set<number>>; inputPages: Map<string, number>;
  BODY_PAGE: number; INPUT_PAGE: number; zoom: number; pan: PendingPan | null; geometryFrame: number | null;
  ghost: HTMLElement | null; snapPreview: HTMLElement | null; bodyObserver: IntersectionObserver | null;
  planeFloor: number; openAnchor: Element | null | undefined; shapeObserver: ResizeObserver | null;
  controls: HTMLElement; destinationLabel: HTMLElement; cancelButton: HTMLButtonElement; commitButton: HTMLButtonElement;
  messageBox: HTMLElement; fieldError: HTMLElement; layout: HTMLElement; palette: HTMLElement; workspace: HTMLElement;
  paletteControls: HTMLElement; workspaceShell: HTMLElement; plane: HTMLElement; world: HTMLElement; navigation: HTMLElement;
  zoomLabel: HTMLButtonElement; minus: HTMLButtonElement; plus: HTMLButtonElement; home: HTMLButtonElement; fit: HTMLButtonElement;
  libraryToggle: HTMLButtonElement; wide: HTMLButtonElement | null; workspaceTip: HTMLElement; modeSelect: HTMLSelectElement;
  search: HTMLInputElement; categorySelect: HTMLElement; outside: HTMLInputElement; outsideLabel: HTMLLabelElement;
  paletteList: HTMLElement; paletteOptions: HTMLDetailsElement; searchLabel: HTMLLabelElement; searchScope: HTMLElement;
  restoreSearch: HTMLButtonElement; powerHelp: HTMLElement; help: HTMLDetailsElement; paletteToggle: HTMLButtonElement;
  paletteTools: HTMLElement; promptArea: HTMLElement; toolsFrame: number | null;
  NUMBER_EXAMPLES: [string, string][]; pressing: boolean; attention: { id: string | null | undefined; until: number } | null;
  FACE_READINGS: string[][]; FACE_READING_SOURCE: string; FACE_READING_SKIP: string; PLACE_DEPENDENT_KINDS: Set<string>;
  PALETTE_KEYS: string; fieldMeasureContext: CanvasRenderingContext2D | null; HOLD_MS: number;
  pinchPointers: Map<number, ViewPoint>; pinch: { distance: number; zoom: number } | null; pendingPan: PendingPan | null;
  CONTROL_IN_BLOCK: string; LITERAL_KINDS: Set<string>;
  controlPress: { id: number; x: number; y: number; handle: BlockHandle; control: PressedControl; picker?: boolean } | null;
  dragReason: HTMLElement | null; dropNote: HTMLElement | null; dropNoteTimer: ReturnType<typeof setTimeout> | null;
  fontStyleObserver: MutationObserver | null;
}
// The events the view listens for (on its elements, the document, the window and the page's fonts), and what an
// element's attributes are set from (null and undefined set none).
export type ViewEvents = GlobalEventHandlersEventMap & Pick<FontFaceSetEventMap, 'loadingdone'>;
export type Attributes = { readonly [name: string]: string | number | boolean | null | undefined };
// The calls 10-view-base.ts offers the parts after it.
export interface ViewBaseCalls {
  // An element with its class, text and attributes; a listener let go when the view is; a button for an action.
  E: <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string | null, attrs?: Attributes) => HTMLElementTagNameMap[K];
  listen: <K extends keyof ViewEvents>(n: EventTarget, event: K, fn: (event: ViewEvents[K]) => void, opts?: AddEventListenerOptions) => void;
  button: (label: string, action: string, fn: (event: MouseEvent) => void, attrs?: Attributes) => HTMLButtonElement;
  // A node's schema; the session, the work and the context shown; who does a block and the context there.
  schemaOf: (n: { schemaId?: string } | null | undefined) => BlockSchema | undefined;
  session: () => EditorSession | null;
  project: () => Project | undefined;
  context: () => ViewContext;
  subjectName: (node: BlockTree) => string;
  subjectContext: (node: BlockTree) => ViewContext;
  // The session's tree, the words of a mistake, a copy, a message, the pending field told to the host, an index of a tree.
  getTree: (s: EditorSession | null | undefined) => BlockTree | null;
  errorText: (e: unknown) => string;
  copy: (v: BlockTree) => BlockTree;
  announce: (message: string | null | undefined, error?: boolean) => void;
  notifyPending: () => void;
  paletteKey: (n: Element) => string;
  // The places, the selection and the tools, the faces and the list, the highlight and the shapes (10-view-base.ts).
  applyHighlight: () => void;
  attachShape: (box: HTMLElement, kind: string) => void;
  attendEmptyValue: (id: string | null | undefined) => void;
  availability: (schemaId: string, location: InsertLocation | null | undefined, candidateNode?: BlockTree | null, sourceId?: string | null) => ViewAvailability;
  cancelLabel: () => string;
  defaultDestination: () => BodyPlace | null;
  definitionCalls: (work: Project | null | undefined) => SearchCandidate[];
  destinationDescription: () => string;
  diagnosticSummary: () => HTMLDetailsElement | null;
  edgeShown: (node: BlockTree | null | undefined, field: { key?: string; } | null | undefined, value: unknown) => unknown;
  edgeStored: (node: BlockTree | null | undefined, field: { key?: string; } | null | undefined, value: unknown) => unknown;
  eventHat: () => HTMLDivElement;
  faceRuby: (root: HTMLElement) => HTMLElement;
  headingTitle: (event: string, filter: EventFilter | null | undefined) => string;
  highlight: (location: number | ViewPlace | null | undefined) => void;
  joinAccessibleName: (owner: string, part: string) => string;
  keepKeys: () => void;
  letGoOfSelection: () => boolean;
  lightEmptyValue: () => void;
  listLocation: (info: BlockIndexEntry | null | undefined) => InsertLocation | null;
  locationElement: (place: { id?: string | null; body?: string | null; }) => HTMLElement | undefined;
  locationFromElement: (n: HTMLElement | null | undefined) => InsertLocation | null;
  mapElseBranches: () => void;
  markDrop: (n: HTMLElement, location: InsertLocation) => void;
  measureShape: (box: HTMLElement) => { svg: SVGSVGElement; w: number; h: number; d: string; } | undefined;
  namesFor: (node: BlockTree, field: { key?: string; type?: string }) => string[];
  newRule: () => BlockTree;
  normalizedResult: (result: unknown) => OperationAnswer;
  paletteAvailability: (schema: SearchCandidate, location: InsertLocation | null | undefined, exact?: boolean) => ViewAvailability;
  paletteLabel: (schema: BlockSchema) => string;
  phrase: (schema: BlockSchema) => PhrasePart[] | null;
  placeActions: (menu: HTMLDetailsElement, commands: HTMLElement, options?: { reveal?: boolean; }) => void;
  placeControls: () => void;
  placeNodeTools: () => void;
  placeSlotHead: (slot: Element | null | undefined) => void;
  placedAt: (location: InsertLocation | null | undefined, schemaId: string, inserted?: boolean) => string | null | undefined;
  previewNode: (schema: BlockSchema, candidate: BlockTree | null | undefined) => HTMLSpanElement;
  readInputValue: (input: FieldInput, field: { type?: string; }) => unknown;
  readable: (p: { read: () => unknown; }) => boolean;
  rememberViewState: (owner?: EditorSession | null) => void;
  resolveLocation: (value: ViewPlace | null | undefined) => { id?: string; body?: string | null; };
  revealNode: (id: string | null | undefined) => boolean;
  roleUnit: (node: BlockTree | null | undefined, key: string, index?: number | null) => Unit | null;
  ruleAvailability: () => ViewAvailability;
  runIds: (id: string) => string[];
  sameLocation: (a: Partial<InsertLocation> | null | undefined, b: Partial<InsertLocation> | null | undefined) => boolean;
  sayParticle: (value: BlockTree | null | undefined) => string;
  selection: (id: string, location?: Pick<SelectedBody, 'body' | 'line'> | null) => void;
  showImpliedDestination: () => void;
  shownPhrase: (schema: BlockSchema, node: BlockTree | null | undefined) => PhrasePart[] | null;
  sizeEditingField: (field: HTMLElement, tools?: number) => boolean;
  slotLabel: (location: Partial<InsertLocation>) => string;
  subjectFace: (node: BlockTree, field: { key: string; }) => DocumentFragment | HTMLSpanElement;
  syncDeferredTree: () => void;
  syncLibraryToggle: () => void;
  updateFieldWidths: () => void;
  valueToolsShown: () => boolean;
  wrapCount: (schema: BlockSchema | null | undefined, node: BlockTree | null | undefined, location: InsertLocation | null | undefined, movingId?: string | null) => number;
}
// A block's face (phrase): its words and its places, each a token written in its text with the field or the input (and
// the item of a list input) it stands for; and the line break of a face of two lines.
export interface PhraseToken { token: string; slot?: InputItem; field?: SchemaItem; index?: number }
export type PhrasePart = string | Readable<PhraseToken | { lineBreak: true }>;
// Whether a block can be put in a place, as the view answers it (its own answers say only whether, and why not).
// A value block may be picked up before its place is chosen (needsSlot).
export type ViewAvailability = Partial<InsertionAvailability> & { enabled: boolean; needsSlot?: boolean };
// What failed: a thrown error or an answer that says why not (their words are text).
export type Failure = { message?: string; reason?: string } | null | undefined;
// The calls 10-view-editing.ts offers the parts after it.
export interface ViewEditingCalls {
  // Edits: a change through the session, the field being typed taken in or put back, the controls shown for them.
  operate: (op: ViewOperation, options?: { fromPending?: boolean }) => OperationAnswer;
  flush: (options?: { focus?: boolean; explicit?: boolean }) => OperationAnswer;
  cancel: () => { ok: boolean }; cancelField: () => { ok: boolean }; updateControls: () => void;
  // The controls of a field, of who does it and of what changes a sentence beyond its values; a unit put right; a
  // block removed.
  fieldControl: (node: BlockTree, field: SchemaItem, annotation?: boolean, tool?: boolean) => HTMLElement | DocumentFragment;
  actorTool: (node: BlockTree) => HTMLDetailsElement | null;
  extraDisclosure: (node: BlockTree, label: string) => { extra: HTMLDetailsElement; extraControls: HTMLDivElement };
  unitRepair: (quantity: BlockTree, unit: string, nested: BlockTree | null) => HTMLButtonElement | DocumentFragment;
  removeBlock: (node: Pick<BlockTree, 'id'>, info?: BlockIndexEntry) => OperationAnswer;
  // The block list, the place chosen, a block put in from the list, a block moved and what goes in its place.
  renderPalette: () => void; chooseDestination: (location: InsertLocation, options?: { keyboard?: boolean }) => void;
  paletteAdd: (schema: SearchCandidate) => void;
  completeMove: (location: InsertLocation, source?: { id: string; type: string } | null) => void; renderReplacement: () => void;
  // The focus, the drawing's sizes, the panels over the blocks, zoom and what fits, the blocks shown as they come
  // into view, and moving the workspace.
  focus: (location: ViewPlace | number | null | undefined) => boolean; updateGeometry: () => void; scheduleGeometry: () => void;
  placeNodeToolsSoon: () => void; closeBlockPopovers: (target: Node | null, focusTraversal?: boolean) => void;
  setZoom: (value: number, anchor?: ViewPoint | null) => void; fitBlocks: () => void; observeMore: () => void;
  keepInView: (anchor: Element | null | undefined, change: () => void) => void;
  startPan: (pointerId: number, x: number, y: number, left?: number, top?: number) => void; endPan: () => void;
  // Carrying a block: what a press is, what carries it and which blocks go, the ghost under the pointer, the place it
  // would go, why it cannot, the note where it was let go, and stopping it.
  touchLike: (type: string) => boolean; slopOf: (type: string) => number; dropPendingPan: () => void;
  carrierOf: (handle: BlockHandle) => BlockHandle; carriedIds: (state: Pick<DragState, 'id' | 'run'>) => string[];
  beginGhost: (state: DragState) => void; moveGhost: (point: ScreenPoint) => void;
  dragCandidate: (event: ScreenPoint) => HTMLElement | null;
  showDragReason: (text: string) => void; showDropNote: (text: string, x: number, y: number) => void;
  cancelDrag: (options?: { animate?: boolean }) => void;
}
// The calls 10-view-drawing.ts offers the view: drawing the view again, a press that may carry a block and the press
// that carries it, the place a carried block would go and the scroll at the edges, the field focused, a field typed
// before put back, letting go of a carry or a move, and taking the view down.
export interface ViewDrawingCalls {
  render: (options?: { force?: boolean }) => void;
  pressHandle: (event: PointerEvent) => (BlockElement & BlockHandle) | null;
  pressBlock: (handle: BlockElement, pointerId: number, pointerType: string, x: number, y: number, options?: { held?: boolean }) => boolean;
  previewDrag: (point: ScreenPoint) => void; scrollDrag: (timestamp?: number) => void;
  focusBlockField: (target: HTMLElement) => void; restorePending: (saved: PendingEdit | null | undefined) => boolean;
  releaseInteraction: () => void; destroy: () => void;
}
// The redraw the parts ask for (filled by 10-view-drawing.ts): drawing the view again, at once with force.
export interface ViewRedraw { render: (options?: { force?: boolean }) => void }
