import { describe, expect, it } from 'vitest';
import {
  activeIndex,
  deleteSegment,
  insertAfter,
  mergeWithNext,
  replaceAll,
  shiftAll,
  splitSegment,
  updateSegment,
} from '../../src/lib/edit';
import { makeSegment } from '../../src/lib/types';

const base = () => [makeSegment(0, 2, 'আমি ভাত খাই'), makeSegment(2, 4, 'তুমি কি খাও'), makeSegment(5, 6, 'শেষ')];

describe('edit operations', () => {
  it('updates and deletes by id', () => {
    const list = base();
    expect(updateSegment(list, list[1].id, { text: 'নতুন' })[1].text).toBe('নতুন');
    expect(deleteSegment(list, list[0].id).map((s) => s.text)).toEqual(['তুমি কি খাও', 'শেষ']);
  });

  it('splits at the cursor with proportional time', () => {
    const list = base();
    const out = splitSegment(list, list[0].id, 'আমি'.length);
    expect(out).toHaveLength(4);
    expect(out[0].text).toBe('আমি');
    expect(out[1].text).toBe('ভাত খাই');
    expect(out[0].end).toBe(out[1].start);
    expect(out[0].end).toBeGreaterThan(0);
    expect(out[0].end).toBeLessThan(2);
  });

  it('refuses to split at the edges', () => {
    const list = base();
    expect(splitSegment(list, list[0].id, 0)).toBe(list);
  });

  it('merges with the next cue', () => {
    const list = base();
    const out = mergeWithNext(list, list[0].id);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ start: 0, end: 4, text: 'আমি ভাত খাই তুমি কি খাও' });
    expect(mergeWithNext(out, out[1].id)).toBe(out);
  });

  it('inserts into gaps without overlapping', () => {
    const list = base();
    const out = insertAfter(list, list[1].id);
    expect(out).toHaveLength(4);
    expect(out[2].start).toBe(4);
    expect(out[2].end).toBe(5);
    expect(insertAfter([], null)[0]).toMatchObject({ start: 0, end: 2 });
  });

  it('shifts all cues and clamps at zero', () => {
    const out = shiftAll(base(), -0.5);
    expect(out.map((s) => [s.start, s.end])).toEqual([
      [0, 1.5],
      [1.5, 3.5],
      [4.5, 5.5],
    ]);
  });

  it('replaces text everywhere and counts matches', () => {
    const { list, count } = replaceAll(base(), 'খা', 'পা');
    expect(count).toBe(2);
    expect(list[0].text).toBe('আমি ভাত পাই');
    expect(replaceAll(base(), '', 'x').count).toBe(0);
  });

  it('finds the active cue', () => {
    const list = base();
    expect(activeIndex(list, 1)).toBe(0);
    expect(activeIndex(list, 2)).toBe(1);
    expect(activeIndex(list, 4.5)).toBe(-1);
  });
});
