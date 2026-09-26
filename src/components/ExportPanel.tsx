import { useRef, useState } from 'react';
import { useI18n } from '../i18n-context';
import { Icon } from './Icon';
import type { Segment } from '../lib/types';
import { toSRT, toTXT, toVTT } from '../lib/subtitles';
import { baseName, downloadBlob, downloadText } from '../lib/download';
import { burnSubtitles, burnSupported } from '../lib/burn';

interface Props {
  segments: Segment[];
  fileName: string;
  media: { url: string; kind: 'video' | 'audio' } | null;
  disabled: boolean;
}

export const CAPTION_FONT = '"Noto Sans Bengali", "Hind Siliguri", "Nirmala UI", system-ui, sans-serif';

export function ExportPanel({ segments, fileName, media, disabled }: Props) {
  const { t } = useI18n();
  const [burnPct, setBurnPct] = useState<number | null>(null);
  const [burnError, setBurnError] = useState<string | null>(null);
  const [watermark, setWatermark] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const name = baseName(fileName);
  const empty = segments.length === 0;

  const burn = async () => {
    if (!media) return;
    if (!burnSupported()) {
      setBurnError(t('export.burnUnsupported'));
      return;
    }
    setBurnError(null);
    setBurnPct(0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await document.fonts?.load(`600 32px ${CAPTION_FONT}`, 'বাংলা');
      const blob = await burnSubtitles({
        mediaUrl: media.url,
        kind: media.kind,
        segments,
        fontFamily: CAPTION_FONT,
        watermark: watermark ? 'kotha · বাংলা সাবটাইটেল' : undefined,
        onProgress: (f) => setBurnPct(Math.round(f * 100)),
        signal: controller.signal,
      });
      downloadBlob(blob, `${name}.subtitled.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setBurnError(t('error.generic', { message: err instanceof Error ? err.message : String(err) }));
      }
    } finally {
      setBurnPct(null);
      abortRef.current = null;
    }
  };

  return (
    <section className="card export" aria-label={t('export.title')}>
      <h3>
        <Icon name="download" size={18} /> {t('export.title')}
      </h3>
      <div className="row gap wrap">
        <button
          className="btn primary"
          disabled={disabled || empty}
          onClick={() => downloadText(toSRT(segments), `${name}.srt`, 'application/x-subrip')}
          data-testid="export-srt"
        >
          {t('export.srt')}
        </button>
        <button
          className="btn"
          disabled={disabled || empty}
          onClick={() => downloadText(toVTT(segments), `${name}.vtt`, 'text/vtt')}
          data-testid="export-vtt"
        >
          {t('export.vtt')}
        </button>
        <button
          className="btn"
          disabled={disabled || empty}
          onClick={() => downloadText(toTXT(segments), `${name}.txt`)}
          data-testid="export-txt"
        >
          {t('export.txt')}
        </button>
      </div>
      <p className="hint">{t('export.srtHint')}</p>

      {media && (
        <div className="burn">
          {burnPct === null ? (
            <button className="btn" disabled={disabled || empty} onClick={burn} data-testid="burn">
              <Icon name="video" size={16} /> {t('export.burn')}
            </button>
          ) : (
            <div className="burn-progress">
              <span>{t('export.burning', { pct: burnPct })}</span>
              <div className="bar small">
                <div style={{ width: `${burnPct}%` }} />
              </div>
              <button className="btn ghost small" onClick={() => abortRef.current?.abort()}>
                {t('export.burnCancel')}
              </button>
            </div>
          )}
          <label className="check">
            <input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} />
            <span>{t('export.watermark')}</span>
          </label>
          <p className="hint">{t('export.burnHint')}</p>
          {burnError && <p className="error">{burnError}</p>}
        </div>
      )}
    </section>
  );
}
