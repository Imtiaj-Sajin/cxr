import { makeSegment, type Segment } from './types';

/** Format seconds as `HH:MM:SS,mmm` (SRT) or `HH:MM:SS.mmm` (VTT). */
export function formatTimestamp(seconds: number, separator: ',' | '.' = ','): string {
  const totalMs = Math.max(0, Math.round((Number.isFinite(seconds) ? seconds : 0) * 1000));
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(ms, 3)}`;
}

/** Short human display, e.g. `1:05.3` or `1:02:05.3`. */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const tenths = Math.floor((safe * 10) % 10);
  const total = Math.floor(safe);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}.${tenths}` : `${m}:${ss}.${tenths}`;
}

/**
 * Parse a timestamp such as `00:01:02,500`, `01:02.5`, `62.5` or `1:02:03`.
 * Returns NaN when the input is not a valid timestamp.
 */
export function parseTimestamp(input: string): number {
  const str = input.trim().replace(',', '.');
  if (!str) return NaN;
  const parts = str.split(':');
  if (parts.length > 3) return NaN;
  let total = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const isLast = i === parts.length - 1;
    if (!(isLast ? /^\d+(\.\d+)?$/ : /^\d+$/).test(p)) return NaN;
    total = total * 60 + Number(p);
  }
  return total;
}

function sortedValid(segments: Segment[]): Segment[] {
  return segments
    .filter((s) => s.text.trim().length > 0 && s.end > s.start)
    .sort((a, b) => a.start - b.start);
}

export function toSRT(segments: Segment[]): string {
  return sortedValid(segments)
    .map(
      (seg, i) =>
        // A blank line inside the text would end the cue early in players.
        `${i + 1}\n${formatTimestamp(seg.start, ',')} --> ${formatTimestamp(seg.end, ',')}\n${seg.text.trim().replace(/\n{2,}/g, '\n')}\n`,
    )
    .join('\n');
}

export function toVTT(segments: Segment[]): string {
  const body = sortedValid(segments)
    .map(
      (seg) =>
        // A blank line would end the cue early, so collapse accidental empty lines.
        `${formatTimestamp(seg.start, '.')} --> ${formatTimestamp(seg.end, '.')}\n${seg.text.trim().replace(/\n{2,}/g, '\n')}\n`,
    )
    .join('\n');
  return `WEBVTT\n\n${body}`;
}

export function toTXT(segments: Segment[], withTimes = false): string {
  return sortedValid(segments)
    .map((seg) => (withTimes ? `[${formatClock(seg.start)}] ${seg.text.trim()}` : seg.text.trim()))
    .join('\n');
}

const CUE_TIME = /^\s*([\d:.,]+)\s*-->\s*([\d:.,]+)/;

/** Parse SRT or WebVTT text into segments. Invalid cues are skipped. */
export function parseSubtitles(input: string): Segment[] {
  const text = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const blocks = text.split(/\n{2,}/);
  const out: Segment[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const timeIdx = lines.findIndex((l) => CUE_TIME.test(l));
    if (timeIdx === -1) continue;
    const m = lines[timeIdx].match(CUE_TIME)!;
    const start = parseTimestamp(m[1]);
    const end = parseTimestamp(m[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const cueText = lines
      .slice(timeIdx + 1)
      .join('\n')
      .replace(/<[^>]+>/g, '') // strip VTT/SRT styling tags like <i> or <c.yellow>
      .trim();
    if (!cueText) continue;
    out.push(makeSegment(start, end, cueText));
  }
  return out.sort((a, b) => a.start - b.start);
}
