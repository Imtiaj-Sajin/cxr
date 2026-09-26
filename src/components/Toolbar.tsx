import { useState } from 'react';
import { useI18n } from '../i18n-context';
import { Icon } from './Icon';

interface Props {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onReplaceAll: (find: string, replacement: string) => number;
  onShift: (delta: number) => void;
  onBanglaDigits: () => void;
  onLatinDigits: () => void;
  onDanda: () => void;
  disabled: boolean;
}

type Panel = 'none' | 'find' | 'shift' | 'tools';

export function Toolbar(p: Props) {
  const { t } = useI18n();
  const [panel, setPanel] = useState<Panel>('none');
  const [find, setFind] = useState('');
  const [replacement, setReplacement] = useState('');
  const [replaced, setReplaced] = useState<number | null>(null);
  const [delta, setDelta] = useState('0.5');

  const toggle = (next: Panel) => setPanel((cur) => (cur === next ? 'none' : next));

  return (
    <div className="toolbar-wrap">
      <div className="toolbar" role="toolbar">
        <button className="icon-btn" onClick={p.onUndo} disabled={!p.canUndo} title={`${t('editor.undo')} (Ctrl+Z)`} aria-label={t('editor.undo')}>
          <Icon name="undo" />
        </button>
        <button className="icon-btn" onClick={p.onRedo} disabled={!p.canRedo} title={`${t('editor.redo')} (Ctrl+Shift+Z)`} aria-label={t('editor.redo')}>
          <Icon name="redo" />
        </button>
        <span className="sep" />
        <button className={`tb-btn ${panel === 'find' ? 'on' : ''}`} onClick={() => toggle('find')} disabled={p.disabled}>
          <Icon name="search" size={16} /> {t('editor.findReplace')}
        </button>
        <button className={`tb-btn ${panel === 'shift' ? 'on' : ''}`} onClick={() => toggle('shift')} disabled={p.disabled}>
          <Icon name="clock" size={16} /> {t('editor.shift')}
        </button>
        <button className={`tb-btn ${panel === 'tools' ? 'on' : ''}`} onClick={() => toggle('tools')} disabled={p.disabled}>
          <Icon name="edit" size={16} /> {t('editor.tools')}
        </button>
      </div>

      {panel === 'find' && (
        <form
          className="tb-panel"
          onSubmit={(e) => {
            e.preventDefault();
            setReplaced(p.onReplaceAll(find, replacement));
          }}
        >
          <input placeholder={t('editor.find')} aria-label={t('editor.find')} value={find} onChange={(e) => setFind(e.target.value)} autoFocus />
          <input
            placeholder={t('editor.replace')}
            aria-label={t('editor.replace')}
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
          />
          <button className="btn small" type="submit" disabled={!find}>
            {t('editor.replaceAll')}
          </button>
          {replaced !== null && <span className="muted">{t('editor.replaced', { count: replaced })}</span>}
        </form>
      )}

      {panel === 'shift' && (
        <form
          className="tb-panel"
          onSubmit={(e) => {
            e.preventDefault();
            const v = Number(delta.replace(',', '.'));
            if (Number.isFinite(v) && v !== 0) p.onShift(v);
          }}
        >
          <label className="muted">{t('editor.shiftHint')}</label>
          <input type="number" step="0.1" value={delta} onChange={(e) => setDelta(e.target.value)} className="narrow" aria-label={t('editor.shift')} />
          <button className="btn small" type="submit">
            {t('editor.apply')}
          </button>
        </form>
      )}

      {panel === 'tools' && (
        <div className="tb-panel">
          <button className="btn small" onClick={p.onBanglaDigits}>
            {t('editor.banglaDigits')}
          </button>
          <button className="btn small" onClick={p.onLatinDigits}>
            {t('editor.latinDigits')}
          </button>
          <button className="btn small" onClick={p.onDanda}>
            {t('editor.danda')}
          </button>
        </div>
      )}
    </div>
  );
}
