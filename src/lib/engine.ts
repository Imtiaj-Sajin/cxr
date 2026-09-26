import type { Engine, TranscribeRequest, WorkerEvent } from './protocol';
import { planPieces } from './segmentation';
import { textToCues } from './postprocess';

/** Runs transcription in a dedicated Web Worker so the page stays responsive. */
export class WorkerEngine implements Engine {
  private worker: Worker | null = null;
  private listener: ((e: WorkerEvent) => void) | null = null;

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('../worker/transcribe.worker.ts', import.meta.url), { type: 'module' });
      this.worker.addEventListener('message', (e: MessageEvent<WorkerEvent>) => this.listener?.(e.data));
      this.worker.addEventListener('error', (e) =>
        this.listener?.({ type: 'error', message: e.message || 'The transcription worker crashed.' }),
      );
    }
    return this.worker;
  }

  start(request: TranscribeRequest, onEvent: (event: WorkerEvent) => void): void {
    this.listener = onEvent;
    // Copy so the caller keeps its buffer for playback/waveform, then transfer the copy.
    const audio = request.audio.slice();
    this.ensureWorker().postMessage({ ...request, audio }, [audio.buffer]);
  }

  cancel(): void {
    this.worker?.postMessage({ type: 'cancel' });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}

const MOCK_LINES = [
  'আসসালামু আলাইকুম, সবাইকে স্বাগতম।',
  'আজকে আমরা দেখব কিভাবে খুব সহজে সাবটাইটেল বানানো যায়।',
  'প্রথমে আপনার ভিডিওটি এখানে আপলোড করুন।',
  'তারপর কিছুক্ষণ অপেক্ষা করুন, সব কাজ আপনার ব্রাউজারেই হবে।',
  'শেষে এসআরটি ফাইল ডাউনলোড করে ইউটিউবে দিয়ে দিন।',
];

/**
 * Fake engine for tests and UI development (`?engine=mock`). It runs the real
 * segmentation on the real audio, then fills each piece with sample Bangla text.
 */
export class MockEngine implements Engine {
  private cancelled = false;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private delayMs = 120) {}

  start(request: TranscribeRequest, onEvent: (event: WorkerEvent) => void): void {
    this.cancelled = false;
    const started = Date.now();
    const pieces = planPieces(request.audio, request.sampleRate);
    const steps: (() => void)[] = [
      () => onEvent({ type: 'stage', stage: 'loading' }),
      () => onEvent({ type: 'load-progress', loaded: 40e6, total: 80e6, progress: 50 }),
      () => onEvent({ type: 'load-progress', loaded: 80e6, total: 80e6, progress: 100 }),
      () => onEvent({ type: 'ready', device: 'wasm', fromCache: false }),
      () => onEvent({ type: 'stage', stage: 'analyzing' }),
      () =>
        onEvent({ type: 'plan', pieces: pieces.length, speechSeconds: pieces.reduce((a, p) => a + p.end - p.start, 0) }),
      () => onEvent({ type: 'stage', stage: 'transcribing' }),
    ];
    let processed = 0;
    pieces.forEach((piece, i) => {
      steps.push(() => {
        processed += piece.end - piece.start;
        onEvent({
          type: 'segments',
          index: i,
          total: pieces.length,
          segments: textToCues(piece, MOCK_LINES[i % MOCK_LINES.length], request.cueOptions),
          processedSeconds: processed,
        });
      });
    });
    steps.push(() => onEvent({ type: 'done', elapsedMs: Date.now() - started, cancelled: false }));

    steps.forEach((step, i) => {
      this.timers.push(
        setTimeout(() => {
          if (this.cancelled) return;
          step();
        }, this.delayMs * (i + 1)),
      );
    });
  }

  cancel(): void {
    this.cancelled = true;
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  dispose(): void {
    this.cancel();
  }
}

export function createEngine(): Engine {
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  return params.get('engine') === 'mock' ? new MockEngine(Number(params.get('mockDelay') ?? 120)) : new WorkerEngine();
}
