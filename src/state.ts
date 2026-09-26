import type { Segment } from './lib/types';

/** Segment list with undo/redo history. */
export interface History {
  past: Segment[][];
  present: Segment[];
  future: Segment[][];
}

export type HistoryAction =
  | { type: 'set'; segments: Segment[]; record?: boolean }
  | { type: 'append'; segments: Segment[] }
  | { type: 'transform'; fn: (list: Segment[]) => Segment[]; record?: boolean }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset'; segments: Segment[] };

const LIMIT = 200;

export const emptyHistory: History = { past: [], present: [], future: [] };

export function historyReducer(state: History, action: HistoryAction): History {
  switch (action.type) {
    case 'set':
      if (action.segments === state.present) return state;
      if (action.record === false) return { ...state, present: action.segments };
      return { past: [...state.past, state.present].slice(-LIMIT), present: action.segments, future: [] };
    case 'transform':
      return historyReducer(state, { type: 'set', segments: action.fn(state.present), record: action.record });
    case 'append':
      // Streaming results are not undo steps.
      return { ...state, present: [...state.present, ...action.segments] };
    case 'undo': {
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      return { past: state.past.slice(0, -1), present: prev, future: [state.present, ...state.future] };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return { past: [...state.past, state.present], present: next, future: rest };
    }
    case 'reset':
      return { past: [], present: action.segments, future: [] };
  }
}
