import { describe, expect, it } from 'vitest';
import { emptyHistory, historyReducer } from '../../src/state';
import { makeSegment } from '../../src/lib/types';
import { translate } from '../../src/lib/i18n';

describe('historyReducer', () => {
  it('records edits and supports undo/redo', () => {
    const a = [makeSegment(0, 1, 'ক')];
    const b = [makeSegment(0, 1, 'খ')];
    let s = historyReducer(emptyHistory, { type: 'reset', segments: a });
    s = historyReducer(s, { type: 'set', segments: b });
    expect(s.present).toBe(b);
    s = historyReducer(s, { type: 'undo' });
    expect(s.present).toBe(a);
    s = historyReducer(s, { type: 'redo' });
    expect(s.present).toBe(b);
    expect(historyReducer(s, { type: 'redo' })).toBe(s);
  });

  it('does not record streamed segments or silent sets as undo steps', () => {
    let s = historyReducer(emptyHistory, { type: 'append', segments: [makeSegment(0, 1, 'ক')] });
    s = historyReducer(s, { type: 'append', segments: [makeSegment(1, 2, 'খ')] });
    expect(s.present).toHaveLength(2);
    expect(s.past).toHaveLength(0);
    s = historyReducer(s, { type: 'set', segments: [], record: false });
    expect(s.past).toHaveLength(0);
  });

  it('a new edit clears the redo stack', () => {
    let s = historyReducer(emptyHistory, { type: 'set', segments: [makeSegment(0, 1, 'ক')] });
    s = historyReducer(s, { type: 'undo' });
    s = historyReducer(s, { type: 'set', segments: [makeSegment(0, 1, 'গ')] });
    expect(s.future).toHaveLength(0);
  });
});

describe('translate', () => {
  it('fills variables and localizes digits in Bangla', () => {
    expect(translate('en', 'progress.pieces', { done: 3, total: 10 })).toBe('Part 3 of 10');
    expect(translate('bn', 'progress.pieces', { done: 3, total: 10 })).toBe('১০টির মধ্যে ৩টি অংশ');
  });
});
