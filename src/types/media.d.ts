// What the product reads from a picture or a sound file before it takes it (07-semantic-analysis.ts): the kind of the
// file and its size, and for a sound the facts its checks need. Types only; the product holds none of this.

// A picture file: its kind and its size in pixels (sniffImage).
export interface ImageSniff { mime: 'image/png' | 'image/jpeg' | 'image/webp'; width: number; height: number }
// A WAV file's format chunk, and the file with its sound data (parseWav).
export interface WavFormat { audioFormat: number; channels: number; sampleRate: number; byteRate: number; blockAlign: number; bitsPerSample: number }
export type WavFile = WavFormat & { data: Uint8Array<ArrayBuffer> };
// The channels and the rate of a sound's frames.
export interface AudioFrameMeta { channels: number; sampleRate: number }
// What sniffAudio finds: a WAV file read whole, or another file with its metadata taken out (clean), the format of its
// frames and, where the file says it, its length in seconds (null when it says none).
export type AudioSniff =
  | { mime: 'audio/wav'; parsed: WavFile; clean?: never; frameMeta?: never; duration?: never }
  | { mime: 'audio/flac' | 'audio/ogg' | 'audio/mp4' | 'audio/mpeg'; clean: Uint8Array<ArrayBuffer>; frameMeta: AudioFrameMeta; duration?: number | null; parsed?: never };
// A box of an MP4 file: its type, where it starts, where its contents start and where it ends.
export interface Mp4Box { type: string; start: number; data: number; end: number }
// A picture decoded by the browser: what is drawn, its size, and how its resources are let go.
export interface DecodedImage { source: ImageBitmap | HTMLImageElement; width: number; height: number; close: () => void }
