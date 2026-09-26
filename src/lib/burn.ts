import type { Segment } from './types';
import { activeIndex } from './edit';

/**
 * Burn subtitles into a video (or turn audio into a captioned video) using only browser
 * APIs: frames are drawn on a canvas, then canvas + audio are recorded with MediaRecorder.
 * Recording happens in real time, so a 5 minute video takes about 5 minutes.
 */

export interface BurnOptions {
  mediaUrl: string;
  kind: 'video' | 'audio';
  segments: Segment[];
  fontFamily: string;
  /** Small credit in the corner. */
  watermark?: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export function pickRecorderMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? null;
}

export function burnSupported(): boolean {
  return (
    typeof document !== 'undefined' &&
    'captureStream' in HTMLCanvasElement.prototype &&
    typeof AudioContext !== 'undefined' &&
    pickRecorderMime() !== null
  );
}

/** Break text into lines that fit `maxWidth`, respecting existing line breaks. */
export function layoutLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        out.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

export function drawCaption(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
  fontFamily: string,
): void {
  if (!text.trim()) return;
  const fontSize = Math.max(16, Math.round(height * 0.055));
  ctx.font = `600 ${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = layoutLines(ctx, text, width * 0.86);
  const lineH = fontSize * 1.45;
  const padX = fontSize * 0.6;
  const padY = fontSize * 0.3;
  const bottom = height - height * 0.07;
  lines.forEach((line, i) => {
    const y = bottom - (lines.length - 1 - i) * lineH - lineH / 2;
    const w = ctx.measureText(line).width;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    const r = fontSize * 0.25;
    const x0 = width / 2 - w / 2 - padX;
    const y0 = y - lineH / 2 + padY / 2;
    const bw = w + padX * 2;
    const bh = lineH - padY;
    ctx.beginPath();
    ctx.roundRect(x0, y0, bw, bh, r);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(line, width / 2, y + fontSize * 0.04);
  });
}

function drawWatermark(ctx: CanvasRenderingContext2D, text: string, width: number, height: number, fontFamily: string) {
  const size = Math.max(11, Math.round(height * 0.024));
  ctx.font = `600 ${size}px ${fontFamily}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fillText(text, width - size, size);
}

export async function burnSubtitles(opts: BurnOptions): Promise<Blob> {
  const mime = pickRecorderMime();
  if (!mime) throw new Error('UNSUPPORTED');

  const media = document.createElement(opts.kind === 'video' ? 'video' : 'audio') as HTMLMediaElement;
  media.src = opts.mediaUrl;
  media.crossOrigin = 'anonymous';
  media.preload = 'auto';
  if (media instanceof HTMLVideoElement) media.playsInline = true;
  await new Promise<void>((resolve, reject) => {
    media.addEventListener('loadedmetadata', () => resolve(), { once: true });
    media.addEventListener('error', () => reject(new Error('MEDIA_LOAD_FAILED')), { once: true });
  });

  const video = media instanceof HTMLVideoElement ? media : null;
  const width = video?.videoWidth ? even(video.videoWidth) : 1280;
  const height = video?.videoHeight ? even(video.videoHeight) : 720;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Route audio into the recording without playing it through the speakers.
  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaElementSource(media);
  const dest = audioCtx.createMediaStreamDestination();
  source.connect(dest);

  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);

  const draw = () => {
    const t = media.currentTime;
    if (video) {
      ctx.drawImage(video, 0, 0, width, height);
    } else {
      const g = ctx.createLinearGradient(0, 0, width, height);
      g.addColorStop(0, '#0f3d3e');
      g.addColorStop(1, '#14532d');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
    }
    const idx = activeIndex(opts.segments, t);
    if (idx >= 0) {
      if (video) drawCaption(ctx, opts.segments[idx].text, width, height, opts.fontFamily);
      else drawCenteredText(ctx, opts.segments[idx].text, width, height, opts.fontFamily);
    }
    if (opts.watermark) drawWatermark(ctx, opts.watermark, width, height, opts.fontFamily);
    if (media.duration > 0) opts.onProgress?.(Math.min(1, t / media.duration));
  };

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime.split(';')[0] }));
    recorder.onerror = () => reject(new Error('RECORDER_FAILED'));
  });

  let raf = 0;
  const loop = () => {
    draw();
    raf = requestAnimationFrame(loop);
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    media.pause();
    if (recorder.state !== 'inactive') recorder.stop();
    stream.getTracks().forEach((tr) => tr.stop());
    void audioCtx.close();
  };
  opts.signal?.addEventListener('abort', stop, { once: true });
  media.addEventListener('ended', () => {
    draw();
    stop();
  });

  media.currentTime = 0;
  draw();
  recorder.start(1000);
  await audioCtx.resume();
  await media.play();
  loop();

  const blob = await done;
  if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return blob;
}

function drawCenteredText(ctx: CanvasRenderingContext2D, text: string, width: number, height: number, fontFamily: string) {
  const fontSize = Math.round(height * 0.07);
  ctx.font = `600 ${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  const lines = layoutLines(ctx, text, width * 0.8);
  const lineH = fontSize * 1.5;
  const top = height / 2 - ((lines.length - 1) * lineH) / 2;
  lines.forEach((line, i) => ctx.fillText(line, width / 2, top + i * lineH));
}

function even(n: number): number {
  return n % 2 === 0 ? n : n - 1;
}
