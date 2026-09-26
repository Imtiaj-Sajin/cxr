/**
 * Runs the real transcription core with a real (tiny) Whisper model in Node.
 * Needs the model from `scripts/fetch-test-model.sh`; skipped when it is missing.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { env, pipeline } from '@huggingface/transformers';
import { loadPipeline, transcribe, type AsrPipeline, type PipelineFactory } from '../../src/worker/core';
import type { TranscribeRequest, WorkerEvent } from '../../src/lib/protocol';
import type { Segment } from '../../src/lib/types';

const MODELS = path.resolve(import.meta.dirname, '../fixtures/models');
const hasModel = existsSync(path.join(MODELS, 'Xenova/whisper-tiny/onnx/decoder_model_merged_quantized.onnx'));

/** Minimal 16-bit PCM WAV reader. */
function readWav(file: string): Float32Array {
  const buf = readFileSync(file);
  let offset = 12;
  while (buf.toString('ascii', offset, offset + 4) !== 'data') offset += 8 + buf.readUInt32LE(offset + 4);
  offset += 8;
  const n = (buf.length - offset) / 2;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(offset + i * 2) / 32768;
  return out;
}

const factory: PipelineFactory = async ({ modelId, dtype, localModelPath }) => {
  env.allowRemoteModels = false;
  env.localModelPath = localModelPath!;
  return (await pipeline('automatic-speech-recognition', modelId, { dtype: dtype as never })) as unknown as AsrPipeline;
};

function request(audio: Float32Array, timestamps: boolean): TranscribeRequest {
  const q8 = { encoder_model: 'q8', decoder_model_merged: 'q8' };
  return {
    type: 'transcribe',
    audio,
    sampleRate: 16000,
    modelId: 'Xenova/whisper-tiny',
    dtype: { webgpu: q8, wasm: q8 },
    device: 'wasm',
    language: 'english',
    timestamps,
    cueOptions: { maxLineChars: 42, maxLines: 2 },
    localModelPath: `${MODELS}/`,
  };
}

describe.skipIf(!hasModel)('real Whisper model (whisper-tiny)', () => {
  for (const timestamps of [true, false]) {
    it(`transcribes English speech with timestamps=${timestamps}`, async () => {
      const audio = readWav(path.resolve(import.meta.dirname, '../fixtures/speech-en.wav'));
      const events: WorkerEvent[] = [];
      const emit = (e: WorkerEvent) => events.push(e);
      const req = request(audio, timestamps);
      const loaded = await loadPipeline(req, factory, false, null, emit);
      expect(loaded.device).toBe('wasm');
      await transcribe(req, loaded, emit, () => false);

      const segments = events.flatMap((e) => (e.type === 'segments' ? e.segments : [])) as Segment[];
      const text = segments.map((s) => s.text).join(' ').toLowerCase();
      expect(text).toContain('cook rice');
      expect(events.at(-1)).toMatchObject({ type: 'done', cancelled: false });
      const duration = audio.length / 16000;
      for (const s of segments) {
        expect(s.start).toBeGreaterThanOrEqual(0);
        expect(s.end).toBeLessThanOrEqual(duration + 0.01);
        expect(s.end).toBeGreaterThan(s.start);
      }
    });
  }
});
