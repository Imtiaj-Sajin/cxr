import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Segment } from '../lib/types';
import { activeIndex } from '../lib/edit';

export interface PlayerHandle {
  seek(time: number): void;
  /** Play from `start` and pause at `end`. */
  playRange(start: number, end: number): void;
  element(): HTMLMediaElement | null;
}

interface Props {
  url: string;
  kind: 'video' | 'audio';
  segments: Segment[];
  onTime: (time: number) => void;
}

export const Player = forwardRef<PlayerHandle, Props>(function Player({ url, kind, segments, onTime }, ref) {
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const stopAt = useRef<number | null>(null);
  const [time, setTime] = useState(0);

  useImperativeHandle(ref, () => ({
    seek(t) {
      const el = mediaRef.current;
      if (el) el.currentTime = t;
    },
    playRange(start, end) {
      const el = mediaRef.current;
      if (!el) return;
      el.currentTime = start;
      stopAt.current = end;
      void el.play().catch(() => undefined);
    },
    element: () => mediaRef.current,
  }));

  // requestAnimationFrame gives smoother caption updates than `timeupdate` (~4 Hz).
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = mediaRef.current;
      if (el) {
        const t = el.currentTime;
        if (stopAt.current !== null && t >= stopAt.current) {
          el.pause();
          stopAt.current = null;
        }
        setTime((prev) => (Math.abs(prev - t) > 0.03 ? t : prev));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    onTime(time);
  }, [time, onTime]);

  const idx = activeIndex(segments, time);
  const caption = idx >= 0 ? segments[idx].text : '';

  return (
    <div className={`player ${kind}`}>
      {kind === 'video' ? (
        <div className="video-wrap">
          <video ref={mediaRef} src={url} controls playsInline preload="metadata" onPause={() => (stopAt.current = null)} />
          {caption && (
            <div className="caption-overlay" data-testid="caption">
              <span>{caption}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="audio-wrap">
          <div className="audio-caption" data-testid="caption">
            {caption ? <span>{caption}</span> : <span className="muted">…</span>}
          </div>
          <audio ref={mediaRef} src={url} controls preload="metadata" onPause={() => (stopAt.current = null)} />
        </div>
      )}
    </div>
  );
});
