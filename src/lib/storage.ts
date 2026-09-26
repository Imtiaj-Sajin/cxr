import type { Segment } from './types';

/** Autosave of the current project. Only text and timings are stored, never the media. */

const KEY = 'kotha:project:v1';
const PREFS_KEY = 'kotha:prefs:v1';

export interface SavedProject {
  fileName: string;
  segments: Segment[];
  savedAt: number;
}

function safeStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function saveProject(project: SavedProject): void {
  try {
    safeStorage()?.setItem(KEY, JSON.stringify(project));
  } catch {
    // Storage full or blocked: autosave is a convenience, so ignore.
  }
}

export function loadProject(): SavedProject | null {
  try {
    const raw = safeStorage()?.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedProject;
    if (!Array.isArray(data.segments) || typeof data.fileName !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}

export function clearProject(): void {
  try {
    safeStorage()?.removeItem(KEY);
  } catch {
    // ignore
  }
}

export interface Prefs {
  lang: 'bn' | 'en';
  modelId: string;
  maxLineChars: number;
  banglaDigits: boolean;
  danda: boolean;
  speechLanguage: string;
  task: 'transcribe' | 'translate';
}

export function loadPrefs(defaults: Prefs): Prefs {
  try {
    const raw = safeStorage()?.getItem(PREFS_KEY);
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<Prefs>) } : defaults;
  } catch {
    return defaults;
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    safeStorage()?.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}
