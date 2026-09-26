/** Speech recognition accuracy metrics (character and word error rate). */

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

/**
 * Normalise text before scoring: Unicode NFC, lower case, Bangla digits to ASCII,
 * punctuation removed, whitespace collapsed. Scores then reflect words, not formatting.
 */
export function normalizeForScoring(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)))
    .replace(/[।॥.,!?;:"'“”‘’()[\]{}\-–—…/\\|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function graphemes(text: string): string[] {
  if (!segmenter) return [...text];
  return Array.from(segmenter.segment(text), (s) => s.segment);
}

/** Levenshtein distance between two token arrays. */
export function editDistance<T>(a: T[], b: T[]): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let cur = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

export interface ErrorCounts {
  charErrors: number;
  chars: number;
  wordErrors: number;
  words: number;
}

/** Error counts for one reference/hypothesis pair (sum these over a test set). */
export function errorCounts(reference: string, hypothesis: string): ErrorCounts {
  const ref = normalizeForScoring(reference);
  const hyp = normalizeForScoring(hypothesis);
  const refChars = graphemes(ref.replace(/ /g, ''));
  const hypChars = graphemes(hyp.replace(/ /g, ''));
  const refWords = ref ? ref.split(' ') : [];
  const hypWords = hyp ? hyp.split(' ') : [];
  return {
    charErrors: editDistance(refChars, hypChars),
    chars: refChars.length,
    wordErrors: editDistance(refWords, hypWords),
    words: refWords.length,
  };
}

export function rates(counts: ErrorCounts[]): { cer: number; wer: number } {
  const sum = counts.reduce(
    (a, c) => ({
      charErrors: a.charErrors + c.charErrors,
      chars: a.chars + c.chars,
      wordErrors: a.wordErrors + c.wordErrors,
      words: a.words + c.words,
    }),
    { charErrors: 0, chars: 0, wordErrors: 0, words: 0 },
  );
  return { cer: sum.chars ? sum.charErrors / sum.chars : 0, wer: sum.words ? sum.wordErrors / sum.words : 0 };
}
