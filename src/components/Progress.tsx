import { useI18n } from '../i18n-context';
import { Icon } from './Icon';
import type { Device } from '../lib/protocol';
import { localizeDigits } from '../lib/i18n';

export interface ProgressState {
  stage: 'loading' | 'analyzing' | 'transcribing';
  loaded: number;
  total: number;
  fromCache: boolean;
  device: Device | null;
  pieces: number;
  done: number;
  speechSeconds: number;
  processedSeconds: number;
  transcribeStartedAt: number | null;
}

export const initialProgress: ProgressState = {
  stage: 'loading',
  loaded: 0,
  total: 0,
  fromCache: false,
  device: null,
  pieces: 0,
  done: 0,
  speechSeconds: 0,
  processedSeconds: 0,
  transcribeStartedAt: null,
};

function formatDuration(seconds: number, lang: 'bn' | 'en'): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const text = m > 0 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
  return lang === 'bn' ? localizeDigits(text.replace('m', ' মি').replace('s', ' সে'), 'bn') : text;
}

export { formatDuration };

export function Progress({ p, partial = '', onCancel }: { p: ProgressState; partial?: string; onCancel: () => void }) {
  const { t, lang } = useI18n();
  let fraction = 0;
  let label = '';
  let detail = '';
  if (p.stage === 'loading') {
    fraction = p.total > 0 ? p.loaded / p.total : 0;
    label = p.fromCache || (p.total > 0 && p.loaded === p.total) ? t('progress.loadingCached') : t('progress.loading');
    detail = p.total > 0 ? localizeDigits(`${(p.loaded / 1e6).toFixed(0)} / ${(p.total / 1e6).toFixed(0)} MB`, lang) : '';
  } else if (p.stage === 'analyzing') {
    label = t('progress.analyzing');
  } else {
    fraction = p.speechSeconds > 0 ? p.processedSeconds / p.speechSeconds : 0;
    label = t('progress.transcribing');
    detail = t('progress.pieces', { done: p.done, total: p.pieces });
    if (p.transcribeStartedAt && p.processedSeconds > 0 && fraction < 1) {
      const elapsed = (Date.now() - p.transcribeStartedAt) / 1000;
      const eta = (elapsed / p.processedSeconds) * (p.speechSeconds - p.processedSeconds);
      detail += ` · ${t('progress.eta', { eta: formatDuration(eta, lang) })}`;
    }
  }
  const pct = Math.round(Math.min(1, fraction) * 100);

  return (
    <div className="card progress" role="status" aria-live="polite" data-testid="progress">
      <div className="progress-head">
        <div>
          <strong>{label}</strong>
          {p.device && (
            <span className="pill">
              <Icon name="chip" size={14} /> {t(p.device === 'webgpu' ? 'progress.device.webgpu' : 'progress.device.wasm')}
            </span>
          )}
        </div>
        <button className="btn ghost small" onClick={onCancel}>
          <Icon name="x" size={14} /> {t('progress.cancel')}
        </button>
      </div>
      <div
        className={`bar ${p.stage === 'analyzing' ? 'indeterminate' : ''}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div style={{ width: `${pct}%` }} />
      </div>
      {p.stage === 'transcribing' && partial.trim() && (
        <p className="live-text" data-testid="live-text" lang="bn">
          {/* Show only the tail so long pieces do not push the layout around. */}
          {partial.trim().length > 110 ? `…${partial.trim().slice(-110)}` : partial.trim()}
          <span className="cursor" aria-hidden="true" />
        </p>
      )}
      <div className="progress-foot muted">
        <span>{detail}</span>
        {p.stage === 'transcribing' && <span>{t('progress.liveHint')}</span>}
      </div>
    </div>
  );
}
