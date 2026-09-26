import { describe, expect, it } from 'vitest';
import { loadPipeline, transcribe, type AsrPipeline, type PipelineFactory } from '../../src/worker/core';
import type { TranscribeRequest, WorkerEvent } from '../../src/lib/protocol';

const SR = 16000;

/** 2 s tone, 2 s silence, 2 s tone: two speech pieces. */
function audio(): Float32Array {
  const out = new Float32Array(SR * 6);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    if (t < 2 || t >= 4) out[i] = 0.3 * Math.sin(2 * Math.PI * 220 * t);
  }
  return out;
}

function request(overrides: Partial<TranscribeRequest> = {}): TranscribeRequest {
  return {
    type: 'transcribe',
    audio: audio(),
    sampleRate: SR,
    modelId: 'test/model',
    dtype: { webgpu: 'fp32', wasm: 'q8' },
    device: 'auto',
    language: 'bengali',
    timestamps: false,
    cueOptions: { maxLineChars: 42, maxLines: 2 },
    ...overrides,
  };
}

function fakeAsr(calls: Record<string, unknown>[], text = 'আমি ভালো আছি'): AsrPipeline {
  return (async (_audio: Float32Array, options: Record<string, unknown>) => {
    calls.push(options);
    return { text };
  }) as AsrPipeline;
}

describe('worker core', () => {
  it('passes language, task and a bounded token budget to the model for each piece', async () => {
    const calls: Record<string, unknown>[] = [];
    const events: WorkerEvent[] = [];
    await transcribe(request({ task: 'translate' }), { key: 'k', device: 'wasm', asr: fakeAsr(calls) }, (e) => events.push(e), () => false);
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c).toMatchObject({ language: 'bengali', task: 'translate', return_timestamps: false });
      expect(c.max_new_tokens as number).toBeGreaterThan(20);
      expect(c.max_new_tokens as number).toBeLessThanOrEqual(440);
    }
    const segs = events.flatMap((e) => (e.type === 'segments' ? e.segments : []));
    expect(segs).toHaveLength(2);
    expect(events.at(-1)).toMatchObject({ type: 'done', cancelled: false });
  });

  it('omits the language for auto-detect and defaults to transcribe', async () => {
    const calls: Record<string, unknown>[] = [];
    await transcribe(request({ language: 'auto' }), { key: 'k', device: 'wasm', asr: fakeAsr(calls) }, () => {}, () => false);
    expect(calls[0].language).toBeUndefined();
    expect(calls[0].task).toBe('transcribe');
  });

  it('stops between pieces when cancelled', async () => {
    const calls: Record<string, unknown>[] = [];
    const events: WorkerEvent[] = [];
    await transcribe(request(), { key: 'k', device: 'wasm', asr: fakeAsr(calls) }, (e) => events.push(e), () => calls.length >= 1);
    expect(calls).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ type: 'done', cancelled: true });
  });

  it('falls back to WASM when WebGPU fails to load, and reuses a cached pipeline', async () => {
    const tried: string[] = [];
    const factory: PipelineFactory = async ({ device }) => {
      tried.push(device);
      if (device === 'webgpu') throw new Error('no adapter');
      return fakeAsr([]);
    };
    const events: WorkerEvent[] = [];
    const loaded = await loadPipeline(request(), factory, true, null, (e) => events.push(e));
    expect(tried).toEqual(['webgpu', 'wasm']);
    expect(loaded.device).toBe('wasm');
    const again = await loadPipeline(request(), factory, true, loaded, (e) => events.push(e));
    expect(again).toBe(loaded);
    expect(tried).toHaveLength(2);
  });

  it('disposes the previous model when switching', async () => {
    let disposed = false;
    const old = Object.assign(fakeAsr([]), { dispose: async () => void (disposed = true) });
    const factory: PipelineFactory = async () => fakeAsr([]);
    await loadPipeline(request({ modelId: 'other/model' }), factory, false, { key: 'test/model|wasm|', device: 'wasm', asr: old }, () => {});
    expect(disposed).toBe(true);
  });
});

describe('streaming', () => {
  it('reports partial text through the streamer hook', async () => {
    const events: WorkerEvent[] = [];
    const asr = Object.assign(
      (async (_a: Float32Array, options: Record<string, unknown>) => {
        const s = options.streamer as { put: (t: string) => void };
        s.put('আমি ');
        s.put('ভালো');
        return { text: 'আমি ভালো' };
      }) as AsrPipeline,
      { makeStreamer: (onText: (t: string) => void) => ({ put: onText }) },
    );
    await transcribe(request(), { key: 'k', device: 'wasm', asr }, (e) => events.push(e), () => false);
    const partials = events.filter((e) => e.type === 'partial');
    expect(partials.at(-1)).toMatchObject({ type: 'partial', text: 'আমি ভালো' });
  });
});
