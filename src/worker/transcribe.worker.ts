/// <reference lib="webworker" />
import { env, pipeline, WhisperTextStreamer } from '@huggingface/transformers';
// Serve the ONNX Runtime WASM files from our own origin instead of a CDN: works offline
// after the first visit, keeps working where the CDN is blocked, and keeps the app private.
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import ortMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import ortWasmPlainUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import ortMjsPlainUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
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

/** Older Safari cannot run the asyncify build without WebGPU (mirrors transformers.js' own check). */
function useAsyncify(device: string): boolean {
  const ua = navigator.userAgent;
  const safari = /Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua);
  const version = Number(ua.match(/Version\/(\d+)/)?.[1] ?? 0);
  return !(safari && version < 26 && device !== 'webgpu');
}

const factory: PipelineFactory = async ({ modelId, device, dtype, localModelPath, onProgress }) => {
  const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown } };
  if (onnx.wasm) {
    onnx.wasm.wasmPaths = useAsyncify(device)
      ? { wasm: new URL(ortWasmUrl, self.location.href).href, mjs: new URL(ortMjsUrl, self.location.href).href }
      : { wasm: new URL(ortWasmPlainUrl, self.location.href).href, mjs: new URL(ortMjsPlainUrl, self.location.href).href };
  }
  if (localModelPath) {
    // A custom host (static server or bucket) laid out as <host>/<org>/<model>/<file>.
    env.allowRemoteModels = true;
    env.allowLocalModels = false;
    env.remoteHost = localModelPath;
    env.remotePathTemplate = '{model}/';
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
  const wrapped = asr as unknown as AsrPipeline;
  wrapped.makeStreamer = (onText) =>
    new WhisperTextStreamer((asr as unknown as { tokenizer: never }).tokenizer, {
      skip_prompt: true,
      callback_function: onText,
    });
  return wrapped;
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
