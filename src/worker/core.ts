import { planPieces, sliceSamples } from '../lib/segmentation';
import { chunksToCues, textToCues } from '../lib/postprocess';
import type { Device, TranscribeRequest, WorkerEvent } from '../lib/protocol';

/** Minimal shape of the transformers.js ASR pipeline we depend on. */
export type AsrPipeline = ((
  audio: Float32Array,
  options: Record<string, unknown>,
) => Promise<{ text: string; chunks?: { text: string; timestamp: [number | null, number | null] }[] }>) & {
  dispose?: () => Promise<unknown>;
};

export interface PipelineFactory {
  (args: {
    modelId: string;
    device: Device;
    dtype: unknown;
    localModelPath?: string;
    onProgress: (e: { loaded: number; total: number; progress: number; file?: string }) => void;
  }): Promise<AsrPipeline>;
}

export interface Loaded {
  key: string;
  device: Device;
  asr: AsrPipeline;
}

/**
 * Load (or reuse) a pipeline, trying WebGPU first and falling back to WASM when WebGPU
 * is missing or fails to initialise (common on older GPUs and some phones).
 */
export async function loadPipeline(
  req: TranscribeRequest,
  factory: PipelineFactory,
  webgpuAvailable: boolean,
  cached: Loaded | null,
  emit: (e: WorkerEvent) => void,
): Promise<Loaded> {
  const order: Device[] =
    req.device === 'wasm' ? ['wasm'] : req.device === 'webgpu' || webgpuAvailable ? ['webgpu', 'wasm'] : ['wasm'];
  const usable = order.filter((d) => d === 'wasm' || webgpuAvailable);

  for (const device of usable) {
    const key = `${req.modelId}|${device}|${req.localModelPath ?? ''}`;
    if (cached && cached.key === key) {
      emit({ type: 'ready', device, fromCache: true });
      return cached;
    }
  }

  // Free the previous model's (GPU) memory before loading another one; phones cannot
  // hold two speech models at once.
  if (cached) await cached.asr.dispose?.().catch(() => undefined);

  let lastError: unknown = null;
  for (const device of usable) {
    const key = `${req.modelId}|${device}|${req.localModelPath ?? ''}`;
    try {
      const asr = await factory({
        modelId: req.modelId,
        device,
        dtype: req.dtype[device],
        localModelPath: req.localModelPath,
        onProgress: (p) => emit({ type: 'load-progress', ...p }),
      });
      emit({ type: 'ready', device, fromCache: false });
      return { key, device, asr };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? 'Could not load the model'));
}

/** Run a full transcription: plan pieces, transcribe each, stream cues back. */
export async function transcribe(
  req: TranscribeRequest,
  loaded: Loaded,
  emit: (e: WorkerEvent) => void,
  isCancelled: () => boolean,
): Promise<void> {
  const started = Date.now();
  emit({ type: 'stage', stage: 'analyzing' });
  const pieces = planPieces(req.audio, req.sampleRate);
  const speechSeconds = pieces.reduce((a, p) => a + (p.end - p.start), 0);
  emit({ type: 'plan', pieces: pieces.length, speechSeconds });
  emit({ type: 'stage', stage: 'transcribing' });

  let processed = 0;
  for (let i = 0; i < pieces.length; i++) {
    if (isCancelled()) {
      emit({ type: 'done', elapsedMs: Date.now() - started, cancelled: true });
      return;
    }
    const piece = pieces[i];
    const audio = sliceSamples(req.audio, req.sampleRate, piece);
    const output = await loaded.asr(audio, {
      language: req.language === 'auto' ? undefined : req.language,
      task: 'transcribe',
      return_timestamps: req.timestamps,
      // Bangla needs ~30 byte-level tokens per second of speech. Allow 50% headroom but no
      // more, so a model stuck in a repetition loop stops early instead of filling 448 tokens.
      max_new_tokens: Math.min(440, Math.ceil((piece.end - piece.start) * 45) + 20),
    });
    const segments =
      req.timestamps && output.chunks?.length
        ? chunksToCues(piece, output.chunks, req.cueOptions)
        : textToCues(piece, output.text ?? '', req.cueOptions);
    processed += piece.end - piece.start;
    emit({ type: 'segments', index: i, total: pieces.length, segments, processedSeconds: processed });
  }
  emit({ type: 'done', elapsedMs: Date.now() - started, cancelled: false });
}
