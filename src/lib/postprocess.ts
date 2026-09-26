import { makeSegment, type Segment } from './types';
import type { Piece } from './segmentation';

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

/**
 * Visible character count. Bangla conjuncts and vowel signs are several code points
 * but one visible cluster, so `string.length` over-counts them.
 */
export function visibleLength(text: string): number {
  if (!segmenter) return [...text].length;
  let n = 0;
  for (const _ of segmenter.segment(text)) n++;
  return n;
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

export function toBanglaDigits(text: string): string {
  return text.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

export function toLatinDigits(text: string): string {
  return text.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
}

/** Bangla letters, vowel signs, virama and khanda-ta. */
const BN_CHAR = '[\\u0980-\\u09FF]';

/** Use the Bangla full stop (দাঁড়ি) after Bangla words; fix ASCII pipe look-alikes. */
export function normalizeDanda(text: string): string {
  return text
    .replace(new RegExp(`(${BN_CHAR})\\s*[.|](?=\\s|$)`, 'g'), '$1।')
    .replace(/\s+।/g, '।');
}

/** Phrases Whisper-family models are known to invent on silence or music. */
const HALLUCINATIONS = [
  /^thank you\.?$/i,
  /^thanks for watching!?\.?$/i,
  /^thank you for watching!?\.?$/i,
  /^please subscribe.*$/i,
  /^subtitles by the amara\.org community$/i,
  /^\[?(music|applause|silence)\]?$/i,
  /^(সাবস্ক্রাইব|লাইক|শেয়ার).{0,40}(করুন|করবেন)[।!]?$/,
];

export function isLikelyHallucination(text: string): boolean {
  const t = text.trim();
  return t.length === 0 || HALLUCINATIONS.some((re) => re.test(t));
}

/**
 * Collapse runaway repetition loops ("আমি আমি আমি আমি ..."), a common failure mode of
 * autoregressive speech models. Short natural repeats (up to 3) are kept.
 */
export function collapseRepeats(text: string, maxRepeats = 3): string {
  let words = text.split(/\s+/).filter(Boolean);
  for (let n = 1; n <= 6; n++) {
    const out: string[] = [];
    let i = 0;
    while (i < words.length) {
      const gram = words.slice(i, i + n).join(' ');
      let reps = 1;
      while (i + (reps + 1) * n <= words.length && words.slice(i + reps * n, i + (reps + 1) * n).join(' ') === gram) {
        reps++;
      }
      if (reps > maxRepeats && gram.length > 0) {
        out.push(...words.slice(i, i + n * (n === 1 ? 2 : 1)));
        i += reps * n;
      } else {
        out.push(words[i]);
        i++;
      }
    }
    words = out;
  }
  return words.join(' ');
}

/** Trim, collapse whitespace, drop special tokens and repetition loops. */
export function cleanTranscript(text: string): string {
  const cleaned = text
    .replace(/<\|[^|]*\|>/g, ' ') // stray special tokens such as <|bn|>
    .replace(/([.…।,!?\-_*~])\1{3,}/g, (_m, ch: string) => (ch === '.' ? '...' : ch)) // "............" -> "..."
    .replace(/(\S{1,8}?)\1{5,}/gu, '$1$1') // loops without spaces: "হাহাহাহাহাহাহা" -> "হাহা"
    .replace(/\s+/g, ' ')
    .trim();
  return collapseRepeats(cleaned);
}

/** Split text into sentence-like units, keeping the punctuation. */
export function splitSentences(text: string): string[] {
  const parts = text.match(/[^।?!.]+[।?!.]*\s*/g) ?? [text];
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Break one long phrase into chunks of at most `maxChars` visible characters at word boundaries. */
export function splitByLength(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (cur && visibleLength(candidate) > maxChars) {
      out.push(cur);
      cur = w;
    } else {
      cur = candidate;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Wrap cue text into at most `maxLines` lines of roughly equal length, breaking at spaces.
 * Text that fits on one line is returned unchanged.
 */
export function wrapLines(text: string, maxLineChars: number, maxLines = 2): string {
  const flat = text.replace(/\s*\n\s*/g, ' ').trim();
  const total = visibleLength(flat);
  if (total <= maxLineChars) return flat;
  const lines = Math.min(maxLines, Math.ceil(total / maxLineChars));
  const target = Math.ceil(total / lines);
  return splitByLength(flat, Math.max(target, 1))
    .reduce<string[]>((acc, part) => {
      // If splitting produced more parts than lines, append the rest to the last line.
      if (acc.length < lines) acc.push(part);
      else acc[acc.length - 1] += ` ${part}`;
      return acc;
    }, [])
    .join('\n');
}

export interface CueOptions {
  /** Maximum visible characters per subtitle line. */
  maxLineChars: number;
  /** Maximum lines per cue. */
  maxLines: number;
}

export const DEFAULT_CUE_OPTIONS: CueOptions = { maxLineChars: 42, maxLines: 2 };

/**
 * Turn the transcript of one audio piece into one or more cues. Time is shared out in
 * proportion to text length, which is a good approximation for continuous speech.
 */
export function textToCues(piece: Piece, rawText: string, options: CueOptions = DEFAULT_CUE_OPTIONS): Segment[] {
  const text = cleanTranscript(rawText);
  if (isLikelyHallucination(text)) return [];
  const maxCue = options.maxLineChars * options.maxLines;
  const units: string[] = [];
  let cur = '';
  for (const sentence of splitSentences(text)) {
    for (const part of visibleLength(sentence) > maxCue ? splitByLength(sentence, maxCue) : [sentence]) {
      const candidate = cur ? `${cur} ${part}` : part;
      if (cur && visibleLength(candidate) > maxCue) {
        units.push(cur);
        cur = part;
      } else {
        cur = candidate;
      }
    }
  }
  if (cur) units.push(cur);
  if (units.length === 0) return [];

  const lengths = units.map((u) => Math.max(1, visibleLength(u)));
  const totalLen = lengths.reduce((a, b) => a + b, 0);
  const duration = piece.end - piece.start;
  let t = piece.start;
  return units.map((u, i) => {
    const start = t;
    const end = i === units.length - 1 ? piece.end : t + (duration * lengths[i]) / totalLen;
    t = end;
    return makeSegment(round3(start), round3(end), wrapLines(u, options.maxLineChars, options.maxLines));
  });
}

/**
 * Convert model timestamp chunks (relative to the piece) to cues. Falls back to
 * proportional timing for chunks with missing or broken timestamps.
 */
export function chunksToCues(
  piece: Piece,
  chunks: { text: string; timestamp: [number | null, number | null] }[],
  options: CueOptions = DEFAULT_CUE_OPTIONS,
): Segment[] {
  const valid = chunks.filter((c) => c.text.trim());
  const timed = valid.every(
    (c, i) =>
      c.timestamp[0] !== null &&
      (c.timestamp[1] !== null || i === valid.length - 1) &&
      (c.timestamp[1] === null || c.timestamp[1]! >= c.timestamp[0]!),
  );
  if (!timed || valid.length === 0) {
    return textToCues(piece, valid.map((c) => c.text).join(' '), options);
  }
  const out: Segment[] = [];
  for (const c of valid) {
    const start = Math.min(piece.end, piece.start + (c.timestamp[0] ?? 0));
    const end = Math.min(piece.end, c.timestamp[1] === null ? piece.end : piece.start + c.timestamp[1]);
    if (end <= start) continue;
    out.push(...textToCues({ start, end }, c.text, options));
  }
  return out;
}

/** Sort, remove overlaps and give every cue a minimum readable duration where possible. */
export function tidySegments(segments: Segment[], minDuration = 0.4): Segment[] {
  const sorted = [...segments].filter((s) => s.text.trim()).sort((a, b) => a.start - b.start);
  return sorted.map((s, i) => {
    const next = sorted[i + 1];
    let end = Math.max(s.end, s.start + minDuration);
    if (next && end > next.start) end = Math.max(s.start + 0.05, next.start);
    return { ...s, end: round3(end) };
  });
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Share of cues (0..1) that contain letters but no Bangla script. When Bangla was
 * requested, a high share means the model failed and wrote English or a translation.
 */
export function nonBanglaShare(segments: { text: string }[]): number {
  const withLetters = segments.filter((s) => /\p{L}/u.test(s.text));
  if (withLetters.length === 0) return 0;
  const foreign = withLetters.filter((s) => !/[\u0980-\u09FF]/.test(s.text));
  return foreign.length / withLetters.length;
}
