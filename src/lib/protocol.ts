import type { Segment } from './types';
import type { CueOptions } from './postprocess';
import type { DtypeSpec } from './models';

export type Device = 'webgpu' | 'wasm';

export interface TranscribeRequest {
  type: 'transcribe';
  /** Mono PCM at `sampleRate` (16 kHz for Whisper). */
  audio: Float32Array;
  sampleRate: number;
  modelId: string;
  dtype: { webgpu: DtypeSpec; wasm: DtypeSpec };
  /** Preferred backend; the worker falls back to wasm when WebGPU is unavailable. */
  device: Device | 'auto';
  language: string;
  /** 'transcribe' keeps the spoken language; 'translate' writes English subtitles. */
  task?: 'transcribe' | 'translate';
  timestamps: boolean;
  cueOptions: CueOptions;
  /** Load models from this local path instead of the Hugging Face Hub (used by tests). */
  localModelPath?: string;
}

export interface CancelRequest {
  type: 'cancel';
}

export type WorkerRequest = TranscribeRequest | CancelRequest;

export type WorkerEvent =
  | { type: 'stage'; stage: 'loading' | 'analyzing' | 'transcribing' }
  | { type: 'load-progress'; loaded: number; total: number; progress: number; file?: string }
  | { type: 'ready'; device: Device; fromCache: boolean }
  | { type: 'plan'; pieces: number; speechSeconds: number }
  | { type: 'partial'; index: number; text: string }
  | { type: 'segments'; index: number; total: number; segments: Segment[]; processedSeconds: number }
  | { type: 'done'; elapsedMs: number; cancelled: boolean }
  | { type: 'error'; message: string };

/** Anything that can run a transcription: the real worker, or the mock used in tests. */
export interface Engine {
  start(request: TranscribeRequest, onEvent: (event: WorkerEvent) => void): void;
  cancel(): void;
  dispose(): void;
}
