/// <reference lib="webworker" />
import { env, pipeline } from '@huggingface/transformers';
import type { WorkerEvent, WorkerRequest } from '../lib/protocol';
import { loadPipeline, transcribe, type AsrPipeline, type Loaded, type PipelineFactory } from './core';

declare const self: DedicatedWorkerGlobalScope;

let loaded: Loaded | null = null;
let cancelled = false;
let busy = false;

const emit = (e: WorkerEvent) => self.postMessage(e);

async function hasWebGPU(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu) return false;
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

const factory: PipelineFactory = async ({ modelId, device, dtype, localModelPath, onProgress }) => {
  if (localModelPath) {
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = localModelPath;
  } else {
    env.allowRemoteModels = true;
    env.allowLocalModels = false;
  }
  const asr = await pipeline('automatic-speech-recognition', modelId, {
    device,
    dtype: dtype as never,
    progress_callback: (info: { status: string; loaded?: number; total?: number; progress?: number }) => {
      if (info.status === 'progress_total') {
        onProgress({ loaded: info.loaded ?? 0, total: info.total ?? 0, progress: info.progress ?? 0 });
      }
    },
  });
  return asr as unknown as AsrPipeline;
};

self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === 'cancel') {
    cancelled = true;
    return;
  }
  if (msg.type !== 'transcribe' || busy) return;
  busy = true;
  cancelled = false;
  try {
    emit({ type: 'stage', stage: 'loading' });
    loaded = await loadPipeline(msg, factory, await hasWebGPU(), loaded, emit);
    await transcribe(msg, loaded, emit, () => cancelled);
  } catch (err) {
    emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  } finally {
    busy = false;
  }
});
