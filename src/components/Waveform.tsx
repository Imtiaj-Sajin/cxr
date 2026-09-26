import { useEffect, useMemo, useRef } from 'react';
import type { Segment } from '../lib/types';
import { computePeaks } from '../lib/audio';
import { activeIndex } from '../lib/edit';

interface Props {
  samples: Float32Array;
  sampleRate: number;
  segments: Segment[];
  time: number;
  onSeek: (time: number) => void;
  /** Seconds visible at once. */
  windowSec?: number;
}

/** Peaks per second of audio used for drawing; 50 gives smooth detail at any zoom we use. */
const PEAKS_PER_SEC = 50;

/**
 * Scrolling waveform around the playhead with the subtitle cues drawn on top.
 * Clicking anywhere seeks there.
 */
export function Waveform({ samples, sampleRate, segments, time, onSeek, windowSec = 20 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const duration = samples.length / sampleRate;
  const peaks = useMemo(
    () => computePeaks(samples, Math.max(1, Math.ceil(duration * PEAKS_PER_SEC))),
    [samples, duration],
  );

  // Keep the playhead at one third of the view, clamped to the file edges.
  const view = Math.min(windowSec, duration || windowSec);
  const start = Math.max(0, Math.min(time - view / 3, duration - view));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const styles = getComputedStyle(canvas);
    const wave = styles.getPropertyValue('--wave').trim() || '#8aa39a';
    const cue = styles.getPropertyValue('--cue').trim() || 'rgba(11,107,83,0.18)';
    const cueActive = styles.getPropertyValue('--cue-active').trim() || 'rgba(11,107,83,0.38)';
    const head = styles.getPropertyValue('--head').trim() || '#e5484d';
    const x = (t: number) => ((t - start) / view) * w;

    // Cue blocks.
    const active = activeIndex(segments, time);
    const labelFont = '600 11px system-ui, sans-serif';
    segments.forEach((s, i) => {
      if (s.end < start || s.start > start + view) return;
      const x0 = x(s.start);
      const x1 = x(s.end);
      ctx.fillStyle = i === active ? cueActive : cue;
      ctx.fillRect(x0, 0, Math.max(2, x1 - x0), h);
      ctx.fillStyle = wave;
      ctx.font = labelFont;
      ctx.fillText(String(i + 1), x0 + 4, 13);
    });

    // Waveform (mirrored bars).
    ctx.fillStyle = wave;
    const mid = h / 2 + 6;
    const amp = h / 2 - 10;
    for (let px = 0; px < w; px++) {
      const t = start + (px / w) * view;
      const p = peaks[Math.min(peaks.length - 1, Math.floor(t * PEAKS_PER_SEC))] ?? 0;
      const bar = Math.max(1, Math.min(1, p * 1.6) * amp);
      ctx.fillRect(px, mid - bar, 1, bar * 2);
    }

    // Playhead.
    ctx.fillStyle = head;
    ctx.fillRect(Math.round(x(time)) - 1, 0, 2, h);
  }, [peaks, segments, time, start, view]);

  return (
    <canvas
      ref={canvasRef}
      className="waveform"
      data-testid="waveform"
      role="slider"
      aria-label="Timeline"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(time)}
      tabIndex={0}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek(Math.max(0, Math.min(duration, start + ((e.clientX - rect.left) / rect.width) * view)));
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onSeek(Math.max(0, time - 1));
        if (e.key === 'ArrowRight') onSeek(Math.min(duration, time + 1));
      }}
    />
  );
}
