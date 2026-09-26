import { describe, expect, it } from 'vitest';
import {
  chunksToCues,
  nonBanglaShare,
  cleanTranscript,
  collapseRepeats,
  isLikelyHallucination,
  normalizeDanda,
  splitSentences,
  textToCues,
  tidySegments,
  toBanglaDigits,
  toLatinDigits,
  visibleLength,
  wrapLines,
} from '../../src/lib/postprocess';
import { makeSegment } from '../../src/lib/types';

describe('visibleLength', () => {
  it('counts Bangla grapheme clusters, not code points', () => {
    // ক্ষ is three code points (ক + ্ + ষ) but one visible cluster.
    expect('ক্ষ'.length).toBe(3);
    expect(visibleLength('ক্ষ')).toBe(1);
    expect(visibleLength('বাংলা')).toBe(2); // বাং + লা
    expect('বাংলা'.length).toBe(5);
  });
});

describe('digits', () => {
  it('converts both ways', () => {
    expect(toBanglaDigits('2026 সাল, 10:30')).toBe('২০২৬ সাল, ১০:৩০');
    expect(toLatinDigits('২০২৬')).toBe('2026');
  });
});

describe('normalizeDanda', () => {
  it('uses দাঁড়ি after Bangla words but keeps decimals and English', () => {
    expect(normalizeDanda('আমি ভাত খাই. তুমি?')).toBe('আমি ভাত খাই। তুমি?');
    expect(normalizeDanda('দাম ১.৫ টাকা|')).toBe('দাম ১.৫ টাকা।');
    expect(normalizeDanda('Hello world.')).toBe('Hello world.');
    expect(normalizeDanda('শেষ .')).toBe('শেষ।');
  });
});

describe('hallucination handling', () => {
  it('flags stock phrases', () => {
    expect(isLikelyHallucination('Thanks for watching!')).toBe(true);
    expect(isLikelyHallucination('সাবস্ক্রাইব করুন')).toBe(true);
    expect(isLikelyHallucination('আজকে আমরা রান্না শিখব')).toBe(false);
  });
  it('collapses repetition loops but keeps natural repeats', () => {
    expect(collapseRepeats('না না না')).toBe('না না না');
    expect(collapseRepeats('আমি আমি আমি আমি আমি আমি')).toBe('আমি আমি');
    expect(collapseRepeats('ভালো আছি ভালো আছি ভালো আছি ভালো আছি ভালো আছি শেষ')).toBe('ভালো আছি শেষ');
  });
  it('collapses runaway punctuation and loops without spaces', () => {
    expect(cleanTranscript('আমি যাব' + '.'.repeat(300))).toBe('আমি যাব...');
    expect(cleanTranscript('হা' + 'হা'.repeat(20) + ' শেষ')).toBe('হাহা শেষ');
    expect(cleanTranscript('হাহাহা ঠিক আছে')).toBe('হাহাহা ঠিক আছে');
  });
  it('cleans special tokens and whitespace', () => {
    expect(cleanTranscript('<|bn|>  আমি   ভালো\nআছি ')).toBe('আমি ভালো আছি');
  });
});

describe('splitSentences', () => {
  it('splits on Bangla and Latin sentence marks', () => {
    expect(splitSentences('আমি যাব। তুমি যাবে? হ্যাঁ! ok. end')).toEqual(['আমি যাব।', 'তুমি যাবে?', 'হ্যাঁ!', 'ok.', 'end']);
  });
});

describe('wrapLines', () => {
  it('leaves short text alone', () => {
    expect(wrapLines('ছোট লাইন', 42)).toBe('ছোট লাইন');
  });
  it('balances long text over two lines', () => {
    const text = 'এটা একটা অনেক লম্বা বাক্য যেটা এক লাইনে ধরবে না তাই দুই লাইনে ভাগ করতে হবে';
    const wrapped = wrapLines(text, 42);
    const lines = wrapped.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines.join(' ')).toBe(text);
    for (const l of lines) expect(visibleLength(l)).toBeLessThanOrEqual(42);
  });
});

describe('textToCues', () => {
  it('splits long text into several cues with proportional timing', () => {
    const text =
      'আজকে আমরা শিখব কিভাবে খুব সহজে ভাত রান্না করা যায়। প্রথমে চাল ভালো করে ধুয়ে নিতে হবে এবং পানি ঝরিয়ে নিতে হবে। তারপর হাঁড়িতে পানি দিয়ে চুলায় বসান।';
    const cues = textToCues({ start: 10, end: 22 }, text, { maxLineChars: 30, maxLines: 2 });
    expect(cues.length).toBeGreaterThan(1);
    expect(cues[0].start).toBe(10);
    expect(cues[cues.length - 1].end).toBe(22);
    for (let i = 1; i < cues.length; i++) expect(cues[i].start).toBeCloseTo(cues[i - 1].end, 3);
    for (const c of cues) for (const line of c.text.split('\n')) expect(visibleLength(line)).toBeLessThanOrEqual(30);
    expect(cues.map((c) => c.text.replace(/\n/g, ' ')).join(' ')).toBe(text);
  });
  it('drops hallucinated text', () => {
    expect(textToCues({ start: 0, end: 2 }, 'Thank you.')).toEqual([]);
  });
});

describe('chunksToCues', () => {
  it('uses model timestamps relative to the piece', () => {
    const cues = chunksToCues({ start: 5, end: 15 }, [
      { text: ' প্রথম অংশ', timestamp: [0, 3.2] },
      { text: ' দ্বিতীয় অংশ', timestamp: [3.5, null] },
    ]);
    expect(cues.map((c) => [c.start, c.end, c.text])).toEqual([
      [5, 8.2, 'প্রথম অংশ'],
      [8.5, 15, 'দ্বিতীয় অংশ'],
    ]);
  });
  it('falls back to proportional timing when timestamps are missing', () => {
    const cues = chunksToCues({ start: 0, end: 4 }, [{ text: 'কিছু কথা', timestamp: [null, null] }]);
    expect(cues).toHaveLength(1);
    expect([cues[0].start, cues[0].end]).toEqual([0, 4]);
  });
  it('clamps timestamps that run past the piece', () => {
    const cues = chunksToCues({ start: 0, end: 4 }, [{ text: 'বেশি লম্বা', timestamp: [1, 9] }]);
    expect(cues[0].end).toBe(4);
  });
});

describe('tidySegments', () => {
  it('sorts, removes empty cues and resolves overlaps', () => {
    const out = tidySegments([
      makeSegment(3, 5, 'খ'),
      makeSegment(0, 3.5, 'ক'),
      makeSegment(6, 6.1, 'গ'),
      makeSegment(7, 8, '  '),
    ]);
    expect(out.map((s) => [s.start, s.end, s.text])).toEqual([
      [0, 3, 'ক'],
      [3, 5, 'খ'],
      [6, 6.4, 'গ'],
    ]);
  });
});

describe('nonBanglaShare', () => {
  it('measures cues written in another script', () => {
    expect(nonBanglaShare([{ text: 'আমি' }, { text: 'I am' }, { text: '...' }])).toBe(0.5);
    expect(nonBanglaShare([])).toBe(0);
    expect(nonBanglaShare([{ text: 'ফেসবুক Facebook' }])).toBe(0);
  });
});
