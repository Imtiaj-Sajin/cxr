import { useRef, useState, type DragEvent } from 'react';
import { useI18n } from '../i18n-context';
import { Icon } from './Icon';
import type { SavedProject } from '../lib/storage';
import type { MessageKey } from '../lib/i18n';

export const MEDIA_ACCEPT = 'audio/*,video/*,.mp4,.mov,.mkv,.webm,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac';
export const SUBTITLE_ACCEPT = '.srt,.vtt,text/vtt';

interface Props {
  onFile: (file: File) => void;
  saved: SavedProject | null;
  onResume: () => void;
  onDiscard: () => void;
}

export function relativeTime(ts: number, t: (k: MessageKey, v?: Record<string, number>) => string): string {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return t('time.justNow');
  if (mins < 60) return t('time.minutes', { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 48) return t('time.hours', { n: hours });
  return t('time.days', { n: Math.round(hours / 24) });
}

export function Landing({ onFile, saved, onResume, onDiscard }: Props) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const srtRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  return (
    <main className="landing">
      <section className="hero">
        <h1>{t('hero.title')}</h1>
        <p className="lead">{t('hero.subtitle')}</p>
      </section>

      {saved && (
        <div className="card resume" role="region" aria-label={t('resume.title')}>
          <div>
            <strong>{t('resume.title')}</strong>
            <p className="muted">
              {t('resume.body', { name: saved.fileName, count: saved.segments.length, when: relativeTime(saved.savedAt, t) })}
            </p>
          </div>
          <div className="row gap">
            <button className="btn primary" onClick={onResume}>
              {t('resume.open')}
            </button>
            <button className="btn ghost" onClick={onDiscard}>
              {t('resume.discard')}
            </button>
          </div>
        </div>
      )}

      <div
        className={`dropzone ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        data-testid="dropzone"
      >
        <div className="drop-icon">
          <Icon name="upload" size={30} />
        </div>
        <p className="drop-title">{t('drop.title')}</p>
        <p className="muted">{t('drop.or')}</p>
        <span className="btn primary">{t('drop.browse')}</span>
        <p className="hint">{t('drop.hint')}</p>
        <input
          ref={inputRef}
          type="file"
          accept={MEDIA_ACCEPT}
          hidden
          data-testid="file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
        />
      </div>

      <button className="link-btn" onClick={() => srtRef.current?.click()}>
        <Icon name="file" size={16} /> {t('drop.importSrt')}
      </button>
      <input
        ref={srtRef}
        type="file"
        accept={SUBTITLE_ACCEPT}
        hidden
        data-testid="srt-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />

      <section className="features">
        <Feature icon="infinity" title={t('feat.free.title')} body={t('feat.free.body')} />
        <Feature icon="lock" title={t('feat.private.title')} body={t('feat.private.body')} />
        <Feature icon="edit" title={t('feat.editor.title')} body={t('feat.editor.body')} />
      </section>

      <section className="faq" aria-labelledby="faq-title">
        <h2 id="faq-title">{t('faq.title')}</h2>
        {([1, 2, 3, 4, 5] as const).map((n) => (
          <details key={n}>
            <summary>{t(`faq.q${n}`)}</summary>
            <p className="muted">{t(`faq.a${n}`)}</p>
          </details>
        ))}
      </section>
    </main>
  );
}

function Feature({ icon, title, body }: { icon: 'infinity' | 'lock' | 'edit'; title: string; body: string }) {
  return (
    <div className="feature">
      <div className="feature-icon">
        <Icon name={icon} size={22} />
      </div>
      <h3>{title}</h3>
      <p className="muted">{body}</p>
    </div>
  );
}
