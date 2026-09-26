import { describe, expect, it } from 'vitest';
import { detectSpeech, planPieces, sliceSamples } from '../../src/lib/segmentation';

const SR = 16000;

/** Build a test signal from [durationSec, amplitude] parts. Speech is a 220 Hz tone plus noise. */
function signal(parts: [number, number][], noise = 0.001): Float32Array {
  const total = parts.reduce((a, [d]) => a + Math.round(d * SR), 0);
  const out = new Float32Array(total);
  let i = 0;
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296 - 0.5;
  };
  for (const [d, amp] of parts) {
    const n = Math.round(d * SR);
    for (let k = 0; k < n; k++, i++) out[i] = amp * Math.sin((2 * Math.PI * 220 * i) / SR) + noise * rand();
  }
  return out;
}

describe('detectSpeech', () => {
  it('finds regions separated by silence', () => {
    const audio = signal([
      [1, 0],
      [2, 0.3],
      [1.5, 0],
      [1, 0.3],
      [1, 0],
    ]);
    const regions = detectSpeech(audio, SR);
    expect(regions).toHaveLength(2);
    expect(regions[0].start).toBeCloseTo(1, 1);
    expect(regions[0].end).toBeCloseTo(3, 1);
    expect(regions[1].start).toBeCloseTo(4.5, 1);
    expect(regions[1].end).toBeCloseTo(5.5, 1);
  });

  it('bridges short pauses inside a sentence', () => {
    const audio = signal([
      [0.5, 0],
      [1, 0.3],
      [0.2, 0],
      [1, 0.3],
      [0.5, 0],
    ]);
    expect(detectSpeech(audio, SR)).toHaveLength(1);
  });

  it('detects continuous speech with no silence at all', () => {
    const regions = detectSpeech(signal([[5, 0.3]]), SR);
    expect(regions).toHaveLength(1);
    expect(regions[0].end - regions[0].start).toBeGreaterThan(4.9);
  });

  it('returns nothing for digital silence', () => {
    expect(detectSpeech(new Float32Array(SR * 3), SR)).toEqual([]);
  });

  it('ignores clicks shorter than the minimum speech length', () => {
    const audio = signal([
      [1, 0],
      [0.06, 0.5],
      [1, 0],
    ]);
    expect(detectSpeech(audio, SR)).toEqual([]);
  });
});

describe('planPieces', () => {
  it('never produces pieces longer than the limit and cuts long speech at a quiet point', () => {
    // 45 s of speech with a slightly quieter dip at 14 s.
    const audio = signal([
      [14, 0.3],
      [0.1, 0.05],
      [31, 0.3],
    ]);
    const pieces = planPieces(audio, SR, { maxPieceSec: 20 });
    expect(pieces.length).toBeGreaterThanOrEqual(3);
    for (const p of pieces) expect(p.end - p.start).toBeLessThanOrEqual(20 + 1e-6);
    expect(pieces.some((p) => Math.abs(p.end - 14.05) < 0.3)).toBe(true);
  });

  it('keeps pieces sorted and non-overlapping, and covers all speech', () => {
    const audio = signal([
      [0.3, 0],
      [3, 0.3],
      [2, 0],
      [4, 0.2],
      [0.5, 0],
      [2, 0.25],
      [3, 0],
    ]);
    const pieces = planPieces(audio, SR);
    for (let i = 1; i < pieces.length; i++) expect(pieces[i].start).toBeGreaterThanOrEqual(pieces[i - 1].end);
    expect(pieces[0].start).toBeLessThanOrEqual(0.3);
    expect(pieces[pieces.length - 1].end).toBeGreaterThanOrEqual(11.8);
  });

  it('starts a new piece after a long pause', () => {
    const audio = signal([
      [2, 0.3],
      [2, 0],
      [2, 0.3],
    ]);
    expect(planPieces(audio, SR)).toHaveLength(2);
  });

  it('packs short phrases separated by small gaps', () => {
    const audio = signal([
      [1, 0.3],
      [0.6, 0],
      [1, 0.3],
      [0.6, 0],
      [1, 0.3],
    ]);
    expect(planPieces(audio, SR)).toHaveLength(1);
  });

  it('handles empty input', () => {
    expect(planPieces(new Float32Array(0), SR)).toEqual([]);
  });
});

describe('sliceSamples', () => {
  it('copies the requested range', () => {
    const audio = new Float32Array(SR * 2).map((_, i) => i);
    const slice = sliceSamples(audio, SR, { start: 0.5, end: 1 });
    expect(slice.length).toBe(SR / 2);
    expect(slice[0]).toBe(SR / 2);
  });
});
