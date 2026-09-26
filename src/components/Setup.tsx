import { useState } from 'react';
import { useI18n } from '../i18n-context';
import { Icon } from './Icon';
import { MODELS, type ModelOption } from '../lib/models';
import { formatClock } from '../lib/subtitles';
import { localizeDigits } from '../lib/i18n';

interface Props {
  fileName: string;
  duration: number | null;
  decoding: boolean;
  webgpu: boolean | null;
  modelId: string;
  onModelChange: (id: string) => void;
  speechLanguage: string;
  onSpeechLanguageChange: (lang: string) => void;
  task: 'transcribe' | 'translate';
  onTaskChange: (task: 'transcribe' | 'translate') => void;
  maxLineChars: number;
  onMaxLineCharsChange: (n: number) => void;
  onStart: () => void;
  onChangeFile: () => void;
}

export function Setup(props: Props) {
  const { t, lang } = useI18n();
  const isBuiltin = MODELS.some((m) => m.id === props.modelId);
  const [custom, setCustom] = useState(isBuiltin ? '' : props.modelId);
  const [showAdvanced, setShowAdvanced] = useState(!isBuiltin);
  const selected: ModelOption | undefined = MODELS.find((m) => m.id === props.modelId);
  const device = props.webgpu ? 'webgpu' : 'wasm';

  return (
    <main className="setup">
      <div className="card setup-card">
        <h2>{t('setup.title')}</h2>

        <dl className="file-meta">
          <div>
            <dt>{t('setup.file')}</dt>
            <dd className="filename" title={props.fileName}>
              <Icon name="file" size={16} /> {props.fileName}
            </dd>
          </div>
          <div>
            <dt>{t('setup.duration')}</dt>
            <dd>
              {props.decoding || props.duration === null ? (
                <span className="muted">{t('setup.decoding')}</span>
              ) : (
                localizeDigits(formatClock(props.duration).replace(/\.\d$/, ''), lang)
              )}
            </dd>
          </div>
        </dl>

        <fieldset className="models">
          <legend>{t('setup.model')}</legend>
          {MODELS.map((m) => (
            <label key={m.id} className={`model ${props.modelId === m.id ? 'selected' : ''}`}>
              <input
                type="radio"
                name="model"
                value={m.id}
                checked={props.modelId === m.id}
                onChange={() => props.onModelChange(m.id)}
              />
              <span className="model-name">
                {t(m.labelKey as never)}
                {m.bangla && <span className="badge">বাংলা</span>}
              </span>
              <span className="model-desc muted">{t(m.descKey as never)}</span>
              <span className="model-size muted">~{localizeDigits(String(m.sizeMB[device]), lang)} MB</span>
            </label>
          ))}
        </fieldset>

        <div className="setup-grid">
          <label className="field">
            <span>{t('setup.language')}</span>
            <select value={props.speechLanguage} onChange={(e) => props.onSpeechLanguageChange(e.target.value)}>
              <option value="bengali">{t('lang.bengali')}</option>
              <option value="english">{t('lang.english')}</option>
              <option value="auto">{t('lang.auto')}</option>
            </select>
          </label>
          <label className="field">
            <span>{t('setup.output')}</span>
            <select value={props.task} onChange={(e) => props.onTaskChange(e.target.value as 'transcribe' | 'translate')}>
              <option value="transcribe">{t('setup.output.same')}</option>
              <option value="translate">{t('setup.output.english')}</option>
            </select>
          </label>
          <label className="field">
            <span>{t('setup.lineLength')}</span>
            <input
              type="number"
              min={20}
              max={80}
              value={props.maxLineChars}
              onChange={(e) => props.onMaxLineCharsChange(Math.min(80, Math.max(20, Number(e.target.value) || 42)))}
            />
          </label>
        </div>

        {props.task === 'translate' && selected?.bangla && <p className="hint">{t('setup.translateHint')}</p>}

        <button className="link-btn small" onClick={() => setShowAdvanced((v) => !v)} aria-expanded={showAdvanced}>
          {t('setup.advanced')} {showAdvanced ? '▴' : '▾'}
        </button>
        {showAdvanced && (
          <label className="field">
            <span>{t('setup.customModel')}</span>
            <input
              type="text"
              placeholder="your-name/whisper-small-bn-onnx"
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value);
                const v = e.target.value.trim();
                if (v) props.onModelChange(v);
              }}
            />
            <small className="muted">{t('setup.customModelHint')}</small>
          </label>
        )}

        <p className={`notice ${props.webgpu ? 'ok' : 'warn'}`}>
          <Icon name="chip" size={16} /> {props.webgpu ? t('setup.device.gpu') : t('setup.device.cpu')}
          {selected && <> {t('setup.download', { mb: selected.sizeMB[device] })}</>}
        </p>

        <div className="row gap wrap">
          <button
            className="btn primary big"
            onClick={props.onStart}
            disabled={props.decoding || props.duration === null}
            data-testid="start"
          >
            {t('setup.start')}
          </button>
          <button className="btn ghost" onClick={props.onChangeFile}>
            {t('setup.change')}
          </button>
        </div>
      </div>
    </main>
  );
}
