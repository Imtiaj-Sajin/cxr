import { makeSegment, type Segment } from './types';
import { visibleLength } from './postprocess';

/** Pure editing operations on a segment list. All return a new array. */

export function updateSegment(list: Segment[], id: string, patch: Partial<Omit<Segment, 'id'>>): Segment[] {
  return list.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

export function deleteSegment(list: Segment[], id: string): Segment[] {
  return list.filter((s) => s.id !== id);
}

/** Split a cue at a character offset in its text; time is split proportionally. */
export function splitSegment(list: Segment[], id: string, offset: number): Segment[] {
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return list;
  const seg = list[idx];
  const left = seg.text.slice(0, offset).trim();
  const right = seg.text.slice(offset).trim();
  if (!left || !right) return list;
  const ratio = visibleLength(left) / (visibleLength(left) + visibleLength(right));
  const mid = Math.round((seg.start + (seg.end - seg.start) * ratio) * 1000) / 1000;
  const a: Segment = { ...seg, end: mid, text: left };
  const b = makeSegment(mid, seg.end, right);
  return [...list.slice(0, idx), a, b, ...list.slice(idx + 1)];
}

/** Merge a cue with the one after it. */
export function mergeWithNext(list: Segment[], id: string): Segment[] {
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1 || idx === list.length - 1) return list;
  const a = list[idx];
  const b = list[idx + 1];
  const merged: Segment = {
    ...a,
    start: Math.min(a.start, b.start),
    end: Math.max(a.end, b.end),
    text: `${a.text.trim()} ${b.text.trim()}`.trim(),
  };
  return [...list.slice(0, idx), merged, ...list.slice(idx + 2)];
}

/** Insert an empty cue after the given one (or at the start when id is null). */
export function insertAfter(list: Segment[], id: string | null, text = ''): Segment[] {
  const idx = id === null ? -1 : list.findIndex((s) => s.id === id);
  const prev = idx >= 0 ? list[idx] : null;
  const next = list[idx + 1] ?? null;
  const start = prev ? prev.end : 0;
  const end = next ? Math.max(start + 0.1, Math.min(next.start, start + 2)) : start + 2;
  const seg = makeSegment(start, end, text);
  return [...list.slice(0, idx + 1), seg, ...list.slice(idx + 1)];
}

/** Shift every cue by `delta` seconds (negative moves earlier), clamped at zero. */
export function shiftAll(list: Segment[], delta: number): Segment[] {
  return list.map((s) => {
    const start = Math.max(0, s.start + delta);
    const end = Math.max(start + 0.05, s.end + delta);
    return { ...s, start: round3(start), end: round3(end) };
  });
}

export function replaceAll(list: Segment[], find: string, replacement: string): { list: Segment[]; count: number } {
  if (!find) return { list, count: 0 };
  let count = 0;
  const out = list.map((s) => {
    const parts = s.text.split(find);
    if (parts.length === 1) return s;
    count += parts.length - 1;
    return { ...s, text: parts.join(replacement) };
  });
  return { list: out, count };
}

/** Index of the cue active at `time`, or -1. */
export function activeIndex(list: Segment[], time: number): number {
  // Linear scan is fine for subtitle-sized lists and tolerates unsorted input.
  for (let i = 0; i < list.length; i++) {
    if (time >= list[i].start && time < list[i].end) return i;
  }
  return -1;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
