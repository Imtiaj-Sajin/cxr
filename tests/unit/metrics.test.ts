import { describe, expect, it } from 'vitest';
import { editDistance, errorCounts, normalizeForScoring, rates } from '../../src/lib/metrics';

describe('metrics', () => {
  it('computes edit distance', () => {
    expect(editDistance([...'kitten'], [...'sitting'])).toBe(3);
    expect(editDistance([], [1, 2])).toBe(2);
    expect(editDistance(['a'], ['a'])).toBe(0);
  });

  it('normalises punctuation, digits and spacing', () => {
    expect(normalizeForScoring('আমি  ভাত খাই। ২০২৬!')).toBe('আমি ভাত খাই 2026');
  });

  it('scores a perfect transcript as zero error', () => {
    const c = errorCounts('আমার সোনার বাংলা।', 'আমার সোনার বাংলা');
    expect(c.wordErrors).toBe(0);
    expect(c.charErrors).toBe(0);
    expect(c.words).toBe(3);
  });

  it('counts word and grapheme errors', () => {
    const c = errorCounts('আমার সোনার বাংলা', 'আমার সোনা বাংলা');
    expect(c.wordErrors).toBe(1);
    expect(c.charErrors).toBe(1); // one grapheme (র) missing
  });

  it('aggregates over a set', () => {
    const r = rates([errorCounts('ক খ', 'ক খ'), errorCounts('গ ঘ', 'গ')]);
    expect(r.wer).toBeCloseTo(0.25);
  });
});
