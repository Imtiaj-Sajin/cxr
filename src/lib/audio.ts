/** Browser-side audio helpers. */

export const TARGET_SAMPLE_RATE = 16000;

export interface DecodedAudio {
  samples: Float32Array;
  sampleRate: number;
  duration: number;
}

/**
 * Decode any audio or video file the browser understands into 16 kHz mono PCM.
 * The file never leaves the device.
 */
export async function decodeFile(file: Blob): Promise<DecodedAudio> {
  const data = await file.arrayBuffer();
  // OfflineAudioContext can decode without a user gesture (unlike AudioContext on some browsers).
  const decoder = new OfflineAudioContext(1, 1, TARGET_SAMPLE_RATE);
  let decoded: AudioBuffer;
  try {
    decoded = await decoder.decodeAudioData(data);
  } catch {
    throw new Error('DECODE_FAILED');
  }
  // decodeAudioData already resamples to the context rate; then a plain channel average
  // is enough and avoids a second full-length render (which doubles memory use).
  if (decoded.sampleRate === TARGET_SAMPLE_RATE) {
    return { samples: downmix(decoded), sampleRate: TARGET_SAMPLE_RATE, duration: decoded.duration };
  }
  const length = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
  const ctx = new OfflineAudioContext(1, length, TARGET_SAMPLE_RATE);
  const src = ctx.createBufferSource();
  src.buffer = decoded;
  src.connect(ctx.destination); // down-mixes to mono and resamples
  src.start();
  const rendered = await ctx.startRendering();
  return { samples: rendered.getChannelData(0), sampleRate: TARGET_SAMPLE_RATE, duration: decoded.duration };
}

export function downmix(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < out.length; i++) out[i] += data[i];
  }
  const scale = 1 / buffer.numberOfChannels;
  for (let i = 0; i < out.length; i++) out[i] *= scale;
  return out;
}

/** Peak amplitude per bucket, for drawing a waveform. */
export function computePeaks(samples: Float32Array, buckets: number): Float32Array {
  const out = new Float32Array(Math.max(1, buckets));
  const size = samples.length / out.length;
  for (let b = 0; b < out.length; b++) {
    const from = Math.floor(b * size);
    const to = Math.min(samples.length, Math.floor((b + 1) * size));
    let peak = 0;
    for (let i = from; i < to; i++) {
      const v = Math.abs(samples[i]);
      if (v > peak) peak = v;
    }
    out[b] = peak;
  }
  return out;
}

export async function detectWebGPU(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!gpu && (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}
