// A work as the editor and the runtime hold it (validateDesignProject, 03-default-assets.ts), and its saved form
// (validateSerializedProjectStructure, 07-semantic-analysis.ts). Types only; the product holds none of this.
import type { Requirements, Unit } from '../../extensions/types.d.ts';
import type { EditorState } from './editor.d.ts';

// A value a variable or a list may hold in a saved work (a part is a value only while the work runs).
export type SavedQuantity = { magnitude: number; unit: Unit | null };
export type SavedScalar = number | string | boolean | SavedQuantity;
export interface VariableData { id: string; name: string; initialValue: SavedScalar; expectedUnit?: Unit | null }
// (a list has no unit: it reads undefined)
export interface ListData { id: string; name: string; initialValue: SavedScalar[]; expectedUnit?: never }
export interface DataSet { variables: VariableData[]; lists: ListData[] }

export type Backdrop =
  | { id: string; name: string; kind: 'color'; value: string }
  | { id: string; name: string; kind: 'image'; assetId: string; fit: 'contain' | 'cover' | 'stretch'; fill: string };
export interface Stage { id: 'stage'; name: string; width: number; height: number; backdrops: Backdrop[]; backdropId: string; showSpeechNames?: boolean }
export type Costume = { id: string; name: string; kind: 'text'; value: string } | { id: string; name: string; kind: 'image'; assetId: string };
// The kinds of part (EVENT_BY_TYPE without the stage).
export type ComponentType = 'label' | 'button' | 'box' | 'input' | 'sprite';
interface ComponentCommon {
  id: string; name: string; x: number; y: number; w: number; h: number; fg: string; bg: string | null; fontSize: number;
  visible: boolean; direction: number; scalePercent: number; text: string; localData: DataSet;
}
// Only a sprite has costumes (the others have them as never: they read undefined).
export type Component = (ComponentCommon & { type: Exclude<ComponentType, 'sprite'>; costumes?: never; costumeId?: never }) | (ComponentCommon & { type: 'sprite'; costumes: Costume[]; costumeId: string });
export type Sprite = Extract<Component, { type: 'sprite' }>;

// When a script starts; a filter names the key, the message or what is touched.
export type EventName = 'start' | 'click' | 'keyDown' | 'message' | 'backdropChanged' | 'valueChanged' | 'cloneStart' | 'touchStart' | 'conditionTrue' | 'interval';
// Exactly one of the three; each form has the other two as never, so any of them can be read (undefined).
export type EventFilter = { key: string; message?: never; target?: never } | { message: string; key?: never; target?: never } | { target: string; key?: never; message?: never };
// The units of a script kept as one text (a 名人 text, or a script with more than one unit).
export interface ScriptDocument { revision: number; unitIds: string[] }
// A part's script has no mode (mode never: it reads undefined, as isMeijinScript asks).
export interface PartScript { id?: string; mode?: never; targetId: string; event: EventName; source: string; filter?: EventFilter | null; document?: ScriptDocument }
// 名人: a script that belongs to no part; in memory it has the pseudo owner MEIJIN_OWNER and the event start.
export interface MeijinScript { id: string; mode: 'meijin'; targetId: 'meijin'; event: 'start'; source: string; document?: ScriptDocument; filter?: never }
export type ProjectScript = PartScript | MeijinScript;
export interface ActionDefinitionData { id: string; ownerId: 'stage'; name: string; args: string[]; source: string; callPhrase?: string }
// (a function has no call phrase: it reads undefined)
export interface FunctionDefinitionData { id: string; ownerId: 'stage'; name: string; args: string[]; source: string; callPhrase?: never }
export interface Sound { id: string; name: string; assetId: string }

export interface Project {
  schema: 'akari-project'; appVersion: string; languageContractId: number; formatVersion: number; name: string;
  stage: Stage; projectData: DataSet; components: Component[]; scripts: ProjectScript[];
  actions: ActionDefinitionData[]; functions: FunctionDefinitionData[]; sounds: Sound[];
  extensions?: Requirements;
}

// What a run reads of a work (RuntimeModel, EventScheduler): an executable restored keeps no source (restoreExecutable),
// so its scripts and the texts of its own blocks are not there, nor what only a saved file names (its schema and its
// versions).
export type RunnableProject = Pick<Project, 'name' | 'stage' | 'projectData' | 'components' | 'sounds' | 'extensions'> &
  Partial<Pick<Project, 'scripts'>> & {
    actions: (Omit<ActionDefinitionData, 'source'> & Partial<Pick<ActionDefinitionData, 'source'>>)[];
    functions: (Omit<FunctionDefinitionData, 'source'> & Partial<Pick<FunctionDefinitionData, 'source'>>)[];
  };
// A picture or a sound of a work.
export type AssetKind = 'image' | 'audio';
export interface AssetData { id: string; kind: AssetKind; mime: string; sha256: string; bytes: Uint8Array; meta?: Record<string, unknown> }
export interface SavedAsset { id: string; kind: AssetKind; mime: string; byteLength: number; sha256: string; dataBase64: string }
// A work as its file holds it (serializedRoot; validateSerializedProjectStructure reads it): the work with its scripts as
// saved (a 名人 script has neither owner nor event there), its pictures and sounds as text, and, when it was kept, the
// editor's state.
export type SavedScript = PartScript | { id: string; mode: 'meijin'; source: string; document?: ScriptDocument; targetId?: never; event?: never; filter?: never };
// (once read, its scripts are made the ones in memory before the work is checked)
export interface SavedProject extends Omit<Project, 'scripts'> { scripts: (SavedScript | ProjectScript)[]; assets: SavedAsset[]; editorState?: EditorState }
