// The runtime's values and its settings (01-runtime-base.ts). Types only; the product holds none of this.
import type { Definition, Unit } from '../../extensions/types.d.ts';
import type { ProfileDefinition } from '../../extensions/profiles.ts';

// A number with a unit; a number without one is a plain number (quantity() gives one).
export interface Quantity { readonly magnitude: number; readonly unit: Unit | null }
export type NumberValue = number | Quantity;
// 名人: a part as a value, by its runtime id; the name is kept for display.
export interface PartValue { readonly part: string; readonly name: string }
export type ScalarValue = NumberValue | string | boolean | PartValue;
// What a variable holds, or a list (whose items are no lists).
export type RuntimeValue = ScalarValue | ScalarValue[];

// What createAkariRuntime is given: the derived profiles and the one to use, the extensions and the capabilities
// they may use.
export interface RuntimeOptions {
  profiles?: ProfileDefinition[];
  profile?: { id: string; version: string } | null;
  extensions?: Definition[];
  allowedCapabilities?: string[];
}

// A fix the editor offers for a mistake: the label of its button and the text it writes in place of start..end.
// input: a part of the proposed text the child is to fill in (a marker, the text that stands for it while the proposal
// is tried, where it is, its name). original: the text it replaces, as written (a check's proposal carries it).
export interface ProposalInput { kind: string; marker: string; label: string; probe: string; offset: number }
export interface Proposal { label: string; source: string; start?: number; end?: number; input?: ProposalInput; original?: string }

// A picture or a sound as the runtime keeps it: frozen, its bytes copied at each read.
export interface AssetRecord {
  readonly id: string; readonly kind: 'image' | 'audio'; readonly mime: string; readonly byteLength: number; readonly sha256: string;
  readonly bytes: Uint8Array<ArrayBuffer>; readonly meta: Readonly<Record<string, unknown>>;
}
// What the editor knows of a picture or a sound, read from its bytes when it is put in or the work is read: a picture's
// size, a sound's length, channels and rate. (A record restored from a runnable file keeps what the file says.)
export type AssetMeta = { readonly width?: number; readonly height?: number; readonly duration?: number; readonly channels?: number; readonly sampleRate?: number };
// A picture or a sound read from a work's file and checked (validateLoadedAssetRecord): its bytes and what is read of them.
export type LoadedAsset = { id: string; kind: 'image' | 'audio'; mime: string; byteLength: number; sha256: string; bytes: Uint8Array<ArrayBuffer>; meta: AssetMeta };
// What a picture or a sound record is made from (an asset store's own record is kept as it is).
export interface AssetInput { id: string; kind: 'image' | 'audio'; mime: string; sha256: string; bytes: Uint8Array; meta?: Record<string, unknown> }
// The grid of what is seen of a picture (AssetRuntimeCache.makeMask): w×h cells, and the seen cells counted up to
// each cell; seen is the box of the seen cells (none when nothing is seen).
export interface PictureMask {
  readonly w: number; readonly h: number; readonly cells: Uint8Array; readonly counts: Uint32Array;
  readonly seen: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number } | null;
}
// A sound that is playing.
export interface AudioHandle {
  id: string; source: AudioScheduledSourceNode; gain: GainNode | null; onEnded: ((id: string) => void) | null; finished: boolean; finish: () => void;
}
// What the pictures and sounds of a run need (collectRuntimeAssetRequirements).
export interface AssetRequirements { imageIds: Set<string>; audioIds: Set<string>; needsAudio: boolean; sampleUsed: boolean }
// Where a part is and how it looks, as a kept touch answer depends on it (pose), and with its id and whether it is
// seen (watchPose). Object types (not interfaces), so samePoses can read them by key.
export type Pose = { x: number; y: number; direction: number; scalePercent: number; costumeId: string | null | undefined; w: number; h: number };
export type WatchPose = Pose & { runtimeId: string; visible: boolean };
// The touch targets that are no part: the whole edge of the screen and its four sides (EDGE_TARGETS).
export type EdgeTarget = '端' | '端:上' | '端:下' | '端:右' | '端:左';
