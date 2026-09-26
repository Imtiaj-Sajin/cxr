import { describe, expect, it } from 'vitest';
import { formatClock, formatTimestamp, parseSubtitles, parseTimestamp, toSRT, toTXT, toVTT } from '../../src/lib/subtitles';
import { makeSegment } from '../../src/lib/types';

describe('formatTimestamp', () => {
  it('formats SRT and VTT styles', () => {
    expect(formatTimestamp(0)).toBe('00:00:00,000');
    expect(formatTimestamp(3661.5)).toBe('01:01:01,500');
    expect(formatTimestamp(62.0004, '.')).toBe('00:01:02.000');
  });
  it('rounds milliseconds without overflowing into 1000', () => {
    expect(formatTimestamp(1.9996)).toBe('00:00:02,000');
  });
  it('clamps negatives and non-finite values', () => {
    expect(formatTimestamp(-4)).toBe('00:00:00,000');
    expect(formatTimestamp(Number.NaN)).toBe('00:00:00,000');
  });
});

describe('formatClock', () => {
  it('uses short display', () => {
    expect(formatClock(65.34)).toBe('1:05.3');
    expect(formatClock(3725.1)).toBe('1:02:05.1');
  });
});

describe('parseTimestamp', () => {
  it('parses the common forms', () => {
    expect(parseTimestamp('00:01:02,500')).toBeCloseTo(62.5);
    expect(parseTimestamp('01:02.25')).toBeCloseTo(62.25);
    expect(parseTimestamp('62.5')).toBeCloseTo(62.5);
    expect(parseTimestamp('1:02:03')).toBe(3723);
  });
  it('rejects junk', () => {
    expect(parseTimestamp('')).toBeNaN();
    expect(parseTimestamp('ab:cd')).toBeNaN();
    expect(parseTimestamp('1:2:3:4')).toBeNaN();
    expect(parseTimestamp('1.5:30')).toBeNaN();
  });
});

const segs = [
  makeSegment(2, 3.5, 'দ্বিতীয় লাইন'),
  makeSegment(0.5, 1.75, 'আমার সোনার বাংলা'),
  makeSegment(4, 4, 'zero length is dropped'),
  makeSegment(5, 6, '   '),
];

describe('exporters', () => {
  it('writes sorted, numbered SRT and skips invalid cues', () => {
    expect(toSRT(segs)).toBe(
      '1\n00:00:00,500 --> 00:00:01,750\nআমার সোনার বাংলা\n\n2\n00:00:02,000 --> 00:00:03,500\nদ্বিতীয় লাইন\n',
    );
  });
  it('writes WebVTT', () => {
    const vtt = toVTT(segs);
    expect(vtt.startsWith('WEBVTT\n\n00:00:00.500 --> 00:00:01.750\nআমার সোনার বাংলা\n')).toBe(true);
  });
  it('collapses blank lines inside cues', () => {
    expect(toVTT([makeSegment(0, 1, 'a\n\n\nb')])).toContain('a\nb');
    expect(toSRT([makeSegment(0, 1, 'a\n\nb')])).toBe('1\n00:00:00,000 --> 00:00:01,000\na\nb\n');
  });
  it('writes plain text with and without times', () => {
    expect(toTXT(segs)).toBe('আমার সোনার বাংলা\nদ্বিতীয় লাইন');
    expect(toTXT(segs, true)).toBe('[0:00.5] আমার সোনার বাংলা\n[0:02.0] দ্বিতীয় লাইন');
  });
});

describe('parseSubtitles', () => {
  it('round-trips SRT', () => {
    const parsed = parseSubtitles(toSRT(segs));
    expect(parsed.map((s) => [s.start, s.end, s.text])).toEqual([
      [0.5, 1.75, 'আমার সোনার বাংলা'],
      [2, 3.5, 'দ্বিতীয় লাইন'],
    ]);
  });
  it('parses VTT with header, CRLF, BOM, cue ids, settings and tags', () => {
    const vtt =
      '﻿WEBVTT\r\nKind: captions\r\n\r\nintro\r\n00:01.000 --> 00:02.500 align:start\r\n<i>হ্যালো</i>\r\nদুনিয়া\r\n\r\nbroken --> cue\r\ntext\r\n';
    const parsed = parseSubtitles(vtt);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ start: 1, end: 2.5, text: 'হ্যালো\nদুনিয়া' });
  });
});
