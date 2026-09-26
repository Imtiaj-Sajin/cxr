/**
 * Measure transcription accuracy of a model with the exact pipeline the app uses.
 *
 *   npx tsx scripts/evaluate.ts --model onnx-community/whisper-small --data eval-data/fleurs-bn
 *   npx tsx scripts/evaluate.ts --model ./out/bangla-asr-onnx --data my-clips --dtype q4
 *
 * The data folder holds pairs of audio + reference text with the same name:
 *   clip1.wav + clip1.txt, clip2.mp3 + clip2.txt, ...
 * Non-WAV audio needs ffmpeg on the PATH. `tools/prepare_eval_data.py` can create a folder
 * from the public FLEURS Bangla test set.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { env, pipeline } from '@huggingface/transformers';
import { loadPipeline, transcribe, type AsrPipeline, type PipelineFactory } from '../src/worker/core';
import type { TranscribeRequest, WorkerEvent } from '../src/lib/protocol';
import { errorCounts, rates, type ErrorCounts } from '../src/lib/metrics';

const { values } = parseArgs({
  options: {
    model: { type: 'string' },
    data: { type: 'string' },
    dtype: { type: 'string', default: 'q8' },
    language: { type: 'string', default: 'bengali' },
    limit: { type: 'string' },
    timestamps: { type: 'boolean', default: false },
    out: { type: 'string' },
  },
});

if (!values.model || !values.data) {
  console.error('Usage: npx tsx scripts/evaluate.ts --model <hf-id|folder> --data <folder> [--dtype q8|q4|fp32] [--limit N]');
  process.exit(1);
}

const AUDIO = /\.(wav|mp3|m4a|ogg|opus|flac|webm|mp4)$/i;
const SR = 16000;

function readWav16k(file: string): Float32Array | null {
  const buf = readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'RIFF') return null;
  let offset = 12;
  let rate = 0;
  let channels = 1;
  let bits = 16;
  while (offset < buf.length - 8) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(offset + 10);
      rate = buf.readUInt32LE(offset + 12);
      bits = buf.readUInt16LE(offset + 22);
    }
    if (id === 'data') {
      if (rate !== SR || channels !== 1 || bits !== 16) return null;
      const n = size / 2;
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(offset + 8 + i * 2) / 32768;
      return out;
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}

function decodeWithFfmpeg(file: string): Float32Array {
  const res = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], {
    maxBuffer: 1 << 30,
  });
  if (res.status !== 0) throw new Error(`ffmpeg failed for ${file}: ${res.stderr?.toString() || res.error}`);
  const b = res.stdout as Buffer;
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}

function loadAudio(file: string): Float32Array {
  return (file.toLowerCase().endsWith('.wav') && readWav16k(file)) || decodeWithFfmpeg(file);
}

const dtypes: Record<string, unknown> = {
  q8: { encoder_model: 'q8', decoder_model_merged: 'q8' },
  q4: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
  fp32: { encoder_model: 'fp32', decoder_model_merged: 'fp32' },
};
const dtype = dtypes[values.dtype!] ?? values.dtype;

// A local folder is loaded from disk; anything else is a Hugging Face model id.
let modelId = values.model;
let localModelPath: string | undefined;
if (existsSync(values.model)) {
  const abs = path.resolve(values.model);
  localModelPath = path.dirname(abs) + path.sep;
  modelId = path.basename(abs);
}

const factory: PipelineFactory = async ({ modelId: id }) => {
  if (localModelPath) {
    env.allowRemoteModels = false;
    env.localModelPath = localModelPath;
  }
  return (await pipeline('automatic-speech-recognition', id, { dtype: dtype as never })) as unknown as AsrPipeline;
};

const files = readdirSync(values.data)
  .filter((f) => AUDIO.test(f) && existsSync(path.join(values.data!, f.replace(AUDIO, '.txt'))))
  .sort()
  .slice(0, values.limit ? Number(values.limit) : undefined);
if (files.length === 0) {
  console.error(`No audio files with matching .txt references found in ${values.data}`);
  process.exit(1);
}

console.log(`Model ${values.model} (${values.dtype}), ${files.length} clips\n`);
const counts: ErrorCounts[] = [];
const rows: { file: string; reference: string; hypothesis: string; cer: number }[] = [];
let audioSeconds = 0;
let loaded: Awaited<ReturnType<typeof loadPipeline>> | null = null;
const started = Date.now();

for (const file of files) {
  const audio = loadAudio(path.join(values.data, file));
  audioSeconds += audio.length / SR;
  const req: TranscribeRequest = {
    type: 'transcribe',
    audio,
    sampleRate: SR,
    modelId,
    dtype: { webgpu: dtype as never, wasm: dtype as never },
    device: 'wasm',
    language: values.language!,
    timestamps: values.timestamps!,
    cueOptions: { maxLineChars: 1000, maxLines: 1 },
    localModelPath,
  };
  const events: WorkerEvent[] = [];
  loaded = await loadPipeline(req, factory, false, loaded, (e) => events.push(e));
  await transcribe(req, loaded, (e) => events.push(e), () => false);
  const hypothesis = events
    .flatMap((e) => (e.type === 'segments' ? e.segments.map((s) => s.text) : []))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const reference = readFileSync(path.join(values.data, file.replace(AUDIO, '.txt')), 'utf8').trim();
  const c = errorCounts(reference, hypothesis);
  counts.push(c);
  const cer = c.chars ? c.charErrors / c.chars : 0;
  rows.push({ file, reference, hypothesis, cer });
  console.log(`${file}  CER ${(cer * 100).toFixed(1)}%\n  ref: ${reference}\n  hyp: ${hypothesis}\n`);
}

const { cer, wer } = rates(counts);
const elapsed = (Date.now() - started) / 1000;
console.log('─'.repeat(60));
console.log(`CER ${(cer * 100).toFixed(2)}%   WER ${(wer * 100).toFixed(2)}%   (${files.length} clips)`);
console.log(`Speed: ${audioSeconds.toFixed(0)} s of audio in ${elapsed.toFixed(0)} s (${(audioSeconds / elapsed).toFixed(2)}x real time, CPU)`);
if (values.out) {
  writeFileSync(values.out, JSON.stringify({ model: values.model, dtype: values.dtype, cer, wer, rows }, null, 2));
  console.log(`Details written to ${values.out}`);
}
