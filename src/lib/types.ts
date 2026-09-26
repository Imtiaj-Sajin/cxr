/** A single subtitle cue. Times are in seconds. */
export interface Segment {
  id: string;
  start: number;
  end: number;
  text: string;
}

let counter = 0;

/** Short unique id for segments (stable within a session, unique enough for React keys). */
export function newId(): string {
  counter = (counter + 1) % 1_000_000;
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function makeSegment(start: number, end: number, text: string): Segment {
  return { id: newId(), start, end, text };
}
