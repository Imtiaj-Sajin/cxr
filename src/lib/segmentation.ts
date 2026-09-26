/**
 * Lightweight energy-based voice activity detection and chunk planning.
 *
 * Whisper-style models work on windows of at most 30 s. Instead of cutting the audio
 * blindly every 30 s (which splits words in half), we find speech regions, then pack
 * them into pieces that end at pauses. Each piece becomes one or more subtitle cues,
 * so the timing stays accurate even for models that cannot predict timestamps.
 */

export interface Piece {
  /** Start time in seconds. */
  start: number;
  /** End time in seconds. */
  end: number;
}

export interface SegmentationOptions {
  /** Analysis frame length in seconds. */
  frameSec?: number;
  /** Longest piece to send to the model, in seconds (Whisper's hard limit is 30). */
  maxPieceSec?: number;
  /** Pieces are merged with neighbours until at least this long (when the gap allows). */
  targetPieceSec?: number;
  /** Silence gaps shorter than this are treated as part of the same speech region. */
  minGapSec?: number;
  /** Gaps longer than this always start a new piece (a new subtitle cue). */
  breakGapSec?: number;
  /** Speech regions shorter than this are dropped as noise. */
  minSpeechSec?: number;
  /** Padding added around each piece so word edges are not clipped. */
  padSec?: number;
}

const DEFAULTS: Required<SegmentationOptions> = {
  frameSec: 0.03,
  // Whisper can emit at most 448 tokens per window, and its tokenizer spends about two
  // tokens per Bangla character (~30 tokens per second of normal speech). 12 s pieces
  // leave headroom for fast speakers.
  maxPieceSec: 12,
  targetPieceSec: 6,
  minGapSec: 0.35,
  breakGapSec: 1.2,
  minSpeechSec: 0.2,
  padSec: 0.15,
};

/** Root-mean-square energy per frame. */
export function frameEnergies(samples: Float32Array, sampleRate: number, frameSec = DEFAULTS.frameSec): Float32Array {
  const frameLen = Math.max(1, Math.round(sampleRate * frameSec));
  const count = Math.ceil(samples.length / frameLen);
  const out = new Float32Array(count);
  for (let f = 0; f < count; f++) {
    const from = f * frameLen;
    const to = Math.min(samples.length, from + frameLen);
    let sum = 0;
    for (let i = from; i < to; i++) sum += samples[i] * samples[i];
    out[f] = Math.sqrt(sum / Math.max(1, to - from));
  }
  return out;
}

function percentile(values: Float32Array, p: number): number {
  if (values.length === 0) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

/**
 * Adaptive threshold: a bit above the noise floor, but never below an absolute minimum
 * (so pure digital silence is not treated as speech).
 */
export function speechThreshold(energies: Float32Array): number {
  const noise = percentile(energies, 0.1);
  const loud = percentile(energies, 0.95);
  const absoluteMin = 0.004; // about -48 dBFS
  // Place the threshold between noise floor and loud speech, closer to the floor. The cap
  // at half the loud level matters when there is no silence at all (the "noise floor" is
  // then speech itself) so continuous speech is still detected.
  return Math.max(absoluteMin, Math.min(noise + (loud - noise) * 0.12, loud * 0.5));
}

/** Find speech regions in seconds. */
export function detectSpeech(samples: Float32Array, sampleRate: number, options: SegmentationOptions = {}): Piece[] {
  const o = { ...DEFAULTS, ...options };
  const energies = frameEnergies(samples, sampleRate, o.frameSec);
  const threshold = speechThreshold(energies);
  const regions: Piece[] = [];
  let startFrame = -1;
  for (let f = 0; f <= energies.length; f++) {
    const voiced = f < energies.length && energies[f] >= threshold;
    if (voiced && startFrame === -1) startFrame = f;
    if (!voiced && startFrame !== -1) {
      regions.push({ start: startFrame * o.frameSec, end: f * o.frameSec });
      startFrame = -1;
    }
  }
  // Merge regions separated by very short gaps (pauses inside a sentence).
  const merged: Piece[] = [];
  for (const r of regions) {
    const last = merged[merged.length - 1];
    if (last && r.start - last.end < o.minGapSec) last.end = r.end;
    else merged.push({ ...r });
  }
  const duration = samples.length / sampleRate;
  return merged
    .filter((r) => r.end - r.start >= o.minSpeechSec)
    .map((r) => ({ start: r.start, end: Math.min(duration, r.end) }));
}

/** Index of the quietest frame in [from, to), used to cut long regions at a natural pause. */
function quietestFrame(energies: Float32Array, from: number, to: number): number {
  let best = from;
  let bestVal = Infinity;
  for (let f = Math.max(0, from); f < Math.min(energies.length, to); f++) {
    if (energies[f] < bestVal) {
      bestVal = energies[f];
      best = f;
    }
  }
  return best;
}

/**
 * Split audio into pieces suitable for transcription.
 * Returns pieces in seconds, sorted, non-overlapping, each at most `maxPieceSec` long.
 */
export function planPieces(samples: Float32Array, sampleRate: number, options: SegmentationOptions = {}): Piece[] {
  const o = { ...DEFAULTS, ...options };
  const duration = samples.length / sampleRate;
  if (duration === 0) return [];
  const speech = detectSpeech(samples, sampleRate, o);
  if (speech.length === 0) return [];
  const energies = frameEnergies(samples, sampleRate, o.frameSec);

  // 1. Cut regions that are too long at their quietest point.
  const bounded: Piece[] = [];
  const maxInner = o.maxPieceSec - 2 * o.padSec;
  for (const r of speech) {
    let start = r.start;
    while (r.end - start > maxInner) {
      const searchFrom = Math.floor((start + maxInner * 0.6) / o.frameSec);
      const searchTo = Math.floor((start + maxInner) / o.frameSec);
      const cut = quietestFrame(energies, searchFrom, searchTo) * o.frameSec;
      bounded.push({ start, end: cut });
      start = cut;
    }
    bounded.push({ start, end: r.end });
  }

  // 2. Pack neighbouring regions into pieces of a comfortable length. A long pause
  //    always starts a new piece, which keeps each cue aligned with what is said.
  const packed: Piece[] = [];
  for (const r of bounded) {
    const last = packed[packed.length - 1];
    const gap = last ? r.start - last.end : Infinity;
    const combined = last ? r.end - last.start : Infinity;
    if (last && gap < o.breakGapSec && last.end - last.start < o.targetPieceSec && combined <= maxInner) {
      last.end = r.end;
    } else {
      packed.push({ ...r });
    }
  }

  // 3. Pad without overlapping neighbours.
  return packed.map((p, i) => {
    const prevEnd = i > 0 ? packed[i - 1].end : 0;
    const nextStart = i < packed.length - 1 ? packed[i + 1].start : duration;
    return {
      start: Math.max(0, prevEnd, p.start - o.padSec),
      end: Math.min(duration, nextStart, p.end + o.padSec),
    };
  });
}

/** Copy the samples of a piece out of the full buffer. */
export function sliceSamples(samples: Float32Array, sampleRate: number, piece: Piece): Float32Array {
  const from = Math.max(0, Math.floor(piece.start * sampleRate));
  const to = Math.min(samples.length, Math.ceil(piece.end * sampleRate));
  return samples.slice(from, to);
}
