// What the editor offers while a source is written (hintCandidates, 02-language-contracts.ts): the hints, the data a
// hint may name, and where the source is being written. Types only; the product holds none of this.
import type { AssetInput, AssetRecord } from './runtime.d.ts';
import type { BlockLocation, BlockSchema, BlockTree } from './blocks.d.ts';
import type { Diagnostic, SourceContext } from './compiled.d.ts';
import type { Script } from './syntax.d.ts';
import type { EventName, Project, SavedScalar } from './project.d.ts';
import type { Qualifier } from './syntax-base.d.ts';
import type { StructuredValue } from './block-view.d.ts';

// A name a hint may use: a made block's argument, a local or a binder (dynamic or scalar), a variable or a list of
// the part or the work, with its value at the start; readonly: a binder (今見ているもの), which a sentence cannot set.
export interface HintBinding {
  name: string; text: string; value: SavedScalar | SavedScalar[]; kind: 'dynamic' | 'scalar' | 'list';
  readonly: boolean; qualifier: Qualifier; local: boolean;
}
// What a search asks for (searchIntent, 09-editor-sessions.ts): the block, and what its words set in it: a direction
// on the screen or along the part's own (with the two of the screen's axis), a number, a scale, a place in a list, a
// color, an empty input field.
export type SearchDirection = 'right' | 'left' | 'up' | 'down';
export interface SearchIntent {
  schemaId: string; direction?: SearchDirection | 'forward' | 'backward'; directions?: SearchDirection[]; value?: number | null; scale?: number;
  index?: number | null; color?: string; empty?: boolean;
}
// A block the search finds (blockSearchCandidates): its schema, and the block made for it (set as the search asks, for
// a hint's name or for a key), the name it binds, its words in the list (shown under it as a caption), the key of the
// candidate and why it cannot be put.
export type SearchCandidate = BlockSchema & {
  candidateNode?: BlockTree; binding?: Hint['binding']; searchLabel?: string; searchCaption?: boolean; candidateKey?: string;
  candidateReason?: string;
  // (a block the tutorial asks for names its lesson; a block's tip may say what it is)
  lessonKey?: string; description?: string;
};
// A hint: what it inserts (a sentence or a value), its palette group, whether it can be inserted here (and why not),
// the name it is about, and the words it is found by.
export interface Hint {
  id: string; category: string; text: string; mode: 'statement' | 'expression'; enabled: boolean; reason: string;
  // (the data a hint reads or sets, or the made block it calls)
  binding: Pick<HintBinding, 'name' | 'qualifier' | 'kind'> | { kind: 'action' | 'function'; id: string; name: string } | null;
  terms: { text: string[]; synonyms: string[]; verbForms: string[]; nounForms: string[]; acceptedReadings: string[]; intent: string[] };
  searchTerms: string[];
}
// Where the hints are for: the source and the place in it, a made block's kind and arguments, the event the script
// starts on, the level of the editor, and the signal names the work sends and receives.
export interface HintOptions {
  source?: string; start?: number; end?: number;
  definitionKind?: 'action' | 'function' | null; args?: string[]; event?: EventName | null;
  level?: string; signalNames?: { sent?: string[]; received?: string[] };
}

// A made block being written (callableDraft): its kind and name, its arguments as written, its short call, its text,
// the block it edits and the source it was loaded from.
export interface CallableDraft {
  ownerId: 'stage'; type: 'action' | 'function'; name: string; argsText: string; callPhrase?: string; source: string;
  editId: string; loadedKey: string;
}
// An editor left with a change not yet taken in (pendingEditors): which editor, the source it edits, the text and the
// mode, the change (its kind, which a field being typed in has none of, and why it is not taken in; the field, its
// node's path and the text typed), and the block draft.
export interface PendingEditor {
  kind: 'script' | 'draft'; ownerKey: string; source: string; mode: 'code' | 'blocks';
  // (the generations a change was made in are read only for whether they are there: a change restored takes the session's;
  // a change of a code kind has its text: validateEditorState)
  pending: {
    kind?: string; reason?: string; field?: string; value?: string; nodePath?: (string | number)[]; sourceRevision?: unknown; contextRevision?: unknown;
    originalSource?: string; id?: string; ownerKey?: string; composing?: boolean; invalid?: boolean; rejected?: boolean;
    diagnostics?: Pick<Diagnostic, 'code' | 'message' | 'line' | 'column' | 'where'>[];
  };
  draftTree: BlockTree | null;
}
// Where an editor was left: the selection in the code and how far it was scrolled.
export interface EditorView {
  kind: 'script' | 'draft'; ownerKey: string;
  codeSelection: { start: number; end: number; direction: 'none' | 'forward' | 'backward' }; scrollState: { codeTop: number; codeLeft: number };
}
// The editor's state kept with a work (validateEditorState): what was selected, the level and the modes, the drafts and
// where each editor was.
export interface EditorState {
  version: 1; revision: number; selectedId: string; currentEvent: EventName; selectedScriptId: string | null;
  uiLevel: 'basic' | 'advanced'; sourceOverviewOpen: boolean; editorModes: { script: 'code' | 'blocks'; draft: 'code' | 'blocks' };
  callableDraft: CallableDraft | null; pendingEditors: PendingEditor[]; views: EditorView[];
}
// A change from one state of the editor's history to the next (workspaceDelta): of a text (how much of its start and of
// its end is kept, and the new middle), of a list (its length and the items changed), of a record (the keys changed
// and the keys gone), or a new value.
export type WorkspaceDelta =
  | ['text', number, number, string] | ['array', number, { [index: string]: WorkspaceDelta }]
  | ['object', { [key: string]: WorkspaceDelta }, string[]] | ['value', unknown];
// One state of the editor's history (encodeWorkspaceHistory, decodeWorkspaceHistory): the work, its pictures and sounds,
// the editor's state, and the made block draft (what it was loaded as, from where, its number, whether it is open).
export interface WorkspaceFrame {
  project: Project; assets: Map<string, AssetInput | AssetRecord> | Iterable<AssetInput | AssetRecord>; editorState: EditorState;
  callableBaseline?: string; callableLoadedKey?: string; draftSerial?: number; draftOpen?: boolean; fingerprint?: string;
}
// A state as the kept history holds it: its pictures and sounds by their place in the history's list.
export interface PackedWorkspaceFrame {
  project: Project; editorState: EditorState; assetRefs: [string, number][];
  callableBaseline: string; callableLoadedKey: string; draftSerial: number; draftOpen: boolean;
}
// The kept history: where it stands, the first state and the changes after it, and the pictures and sounds (the
// pictures built into the product without their bytes: builtin true, blob null, read back from the product's record of
// the same bytes).
export interface SavedWorkspaceHistory {
  version: 1; cursor: number; base: PackedWorkspaceFrame; deltas: WorkspaceDelta[];
  assets: { kind: 'image' | 'audio'; mime: string; byteLength: number; sha256: string; builtin: boolean; blob: Blob | null }[];
}

// The context an editor reads its source in: the source's own context, and the key it is kept by.
export type EditorContext = Partial<SourceContext> & { key?: string; ownerKey?: string };
// A change typed in and not yet taken in (pendingEdit): what kind of change (a block draft with a hole, a code text, …),
// the source it is for, its text and why it is not taken in (and whether the text typed does not read), the generations
// it was made in, and the field being typed.
// (a field being typed in, as the block view tells it, has no kind)
// (a field typed in a group of controls holds what the group reads, StructuredValue; such a change is not kept:
// captureEditorState)
export interface PendingEdit {
  kind?: string; ownerKey?: string; id?: string; composing?: boolean; value?: string | StructuredValue; reason?: string; invalid?: boolean; originalSource?: string;
  // (a code text refused as it is: too long, or a mark it may not have)
  rejected?: boolean;
  sourceRevision?: number; contextRevision?: number; field?: string; nodePath?: (string | number)[];
  // (the one mistake shown, kept with the edit for its recovery)
  diagnostics?: Pick<Diagnostic, 'code' | 'message' | 'line' | 'column' | 'where'>[];
}
// What an editor shows of its source at one time: the text, the tree as read and as blocks, the mistakes, the next
// block number, the block selected and the generations.
export interface EditorSnapshot {
  sourceText: string; syntaxAst: Script | null; blockView: BlockTree | null; nodeMap: Map<string, BlockLocation>;
  nodeIds: WeakMap<object, string>; diagnostics: Diagnostic[]; syntaxDiagnostics: Diagnostic[]; nextBlockId: number;
  blockSelection: string | null; sourceRevision: number; contextRevision: number;
}
// Blocks with a hole the child is still to fill (blockDraft): the source as it was before, the tree and the text with
// the hole, and the change kept pending.
export interface BlockDraft {
  baseline: EditorSnapshot; ast: Script; tree: BlockTree; source: string; pending: PendingEdit;
  // (the code written for the draft in the code view)
  codeSource?: string;
}
// A body chosen in a block (an else branch): the block, the source's key, the body, and the line the body is written
// at in the source (unknown while the body is not drawn).
export interface SelectedBody { id: string; key: string; body: string; line: number | undefined }
// One editor of a source (createEditorSession): whose source it is, the mode it shows, the generations, the context and
// the work it is read in, what it shows (EditorSnapshot), what is selected in the code, where it was scrolled, the
// change typed in and the block draft.
export interface EditorSession extends EditorSnapshot {
  ownerKey: string; ownerKind: string; mode: 'code' | 'blocks'; context: EditorContext; project: Project | undefined;
  codeSelection: { start: number; end: number; direction?: 'none' | 'forward' | 'backward' };
  // (the block view keeps its zoom and scroll, the pages shown of each body and list, the folded blocks and the open memos)
  scrollState: {
    codeTop?: number; codeLeft?: number; blockTop?: number; blockLeft?: number; blockZoom?: number;
    blockBodyPages?: [string, number][]; blockExtraPages?: [string, number[]][]; blockInputPages?: [string, number][];
    blockCollapsed?: string[]; blockOpenAnnotations?: string[];
  };
  // The body chosen in the selected block, kept for the next drawing (SelectedBody).
  blockSelectionLocation?: SelectedBody | null;
  pendingEdit: PendingEdit | null; blockDraft?: BlockDraft | null;
  // (the block chosen when the view went from code to blocks, and the source's generation then: going back to code with
  // the same block keeps the selection in the code)
  codeOriginBlock?: string | null; codeOriginRevision?: number;
  // (the host gives it the notices of the work check for its source)
  notices?: Diagnostic[];
}
// A change of a source's text: what is written in place of start..end.
export interface SourceEdit { start: number; end: number; text: string }
// What a block edit is given besides the change (prepareBlockEdit): the work and the context to read it in, whether
// the work is running or getting ready (no edit then), whether the edit may leave a hole, the source and the generations
// the edit was made on, the change being typed, and a check of the result before it is taken in (it answers false, or
// a verdict that is not ok with its words; it answers at once, never later).
export interface BlockEditOptions {
  project?: Project; context?: EditorContext; locked?: boolean; draft?: boolean;
  ownerKey?: string; sourceRevision?: number; contextRevision?: number; pendingEditId?: string;
  // (what it gives back is a verdict when it is false or has ok, message or then; any other value, a work made say,
  // says nothing)
  validateCandidate?: (result: { source: string }, project: Project) => unknown;
}
// One step of いっしょに作る as written (tutorialDefine is given it): its id and its words, what the child does (a block to
// put in, a value to type, a run, a click while it runs, a choice, an undo), where (the block's place, the value's path
// and field), the value expected (its range, whether it is the child's own number or words, and what is said when they
// are empty), how many clicks, and the course and the place the next steps go to.
export interface TutorialStepInput {
  id: string; message: string; action?: string; block?: string; at?: number; parent?: (string | number)[]; body?: string;
  ref?: (string | number)[]; field?: string; value?: unknown; min?: number; max?: number; free?: boolean; integer?: boolean;
  ownWords?: boolean; emptyMessage?: string; clicks?: number; choice?: string; course?: string; offset?: number;
}
// A step as the guide keeps it (tutorialDefine): the step, its goal, what may be done, how a value is typed, and how it
// succeeds, recovers, goes on and ends.
export type TutorialStep = Readonly<TutorialStepInput & {
  goal: string; target: string; start: string; allowed: readonly string[];
  input: { type: 'text' | 'number'; min: number; max: number } | null;
  ime: string; success: string; recovery: string; next: string; exit: string;
}>;
// Where the guide stands: its steps, the step it is at and its phase, the generation of the work, the step confirmed.
// (no step is confirmed when the guide starts)
export interface TutorialState { steps?: readonly TutorialStep[]; index: number; phase: string; epoch: number; confirmedStep?: string | null }
// What the app has seen when a step may go on (tutorialAdvance): the step confirmed, whether the work is the guide's, and
// whether a change is pending, failed or is the one expected.
export interface TutorialFacts { confirmedStep?: string | null; sameWork: boolean; pending: boolean; failed: boolean; expected: boolean }
