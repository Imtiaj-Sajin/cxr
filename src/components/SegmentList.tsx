import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Segment } from '../lib/types';
import { useI18n } from '../i18n-context';
import { Icon } from './Icon';
import { formatClock, parseTimestamp } from '../lib/subtitles';
import { localizeDigits } from '../lib/i18n';

interface Props {
  segments: Segment[];
  activeIdx: number;
  followPlayback: boolean;
  onChange: (id: string, patch: Partial<Omit<Segment, 'id'>>) => void;
  onSplit: (id: string, offset: number) => void;
  onMerge: (id: string) => void;
  onInsert: (id: string | null) => void;
  onDelete: (id: string) => void;
  onPlay: (seg: Segment) => void;
}

export function SegmentList(props: Props) {
  const { t } = useI18n();
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!props.followPlayback || props.activeIdx < 0) return;
    const row = listRef.current?.children[props.activeIdx] as HTMLElement | undefined;
    // Only scroll the list itself, never the whole page.
    const list = listRef.current?.parentElement;
    if (row && list) {
      const top = row.offsetTop - list.offsetTop;
      if (top < list.scrollTop || top + row.offsetHeight > list.scrollTop + list.clientHeight) {
        list.scrollTo({ top: top - list.clientHeight / 3, behavior: 'smooth' });
      }
    }
  }, [props.activeIdx, props.followPlayback]);

  if (props.segments.length === 0) {
    return (
      <div className="empty">
        <p className="muted">{t('editor.empty')}</p>
        <button className="btn ghost" onClick={() => props.onInsert(null)}>
          <Icon name="plus" size={16} /> {t('editor.addFirst')}
        </button>
      </div>
    );
  }

  return (
    <ol className="segments" ref={listRef} data-testid="segments">
      {props.segments.map((seg, i) => (
        <Row
          key={seg.id}
          seg={seg}
          index={i}
          active={i === props.activeIdx}
          isLast={i === props.segments.length - 1}
          {...props}
        />
      ))}
    </ol>
  );
}

type RowProps = Omit<Props, 'segments' | 'activeIdx' | 'followPlayback'> & {
  seg: Segment;
  index: number;
  active: boolean;
  isLast: boolean;
};

const Row = memo(function Row({ seg, index, active, isLast, onChange, onSplit, onMerge, onInsert, onDelete, onPlay }: RowProps) {
  const { t, lang } = useI18n();
  const textRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [seg.text]);

  return (
    <li className={`segment ${active ? 'active' : ''}`} data-testid="segment">
      <div className="seg-side">
        <span className="seg-num">{localizeDigits(String(index + 1), lang)}</span>
        <button className="icon-btn" title={t('editor.play')} aria-label={t('editor.play')} onClick={() => onPlay(seg)}>
          <Icon name="play" size={15} />
        </button>
      </div>
      <div className="seg-main">
        <div className="seg-times">
          <TimeInput label={t('editor.start')} value={seg.start} onCommit={(v) => onChange(seg.id, { start: v })} />
          <span className="muted">→</span>
          <TimeInput label={t('editor.end')} value={seg.end} onCommit={(v) => onChange(seg.id, { end: v })} />
          {seg.end <= seg.start && <span className="warn-dot" title="end ≤ start" />}
        </div>
        <textarea
          ref={textRef}
          rows={1}
          value={seg.text}
          lang="bn"
          spellCheck={false}
          aria-label={`${t('editor.title')} ${index + 1}`}
          onChange={(e) => onChange(seg.id, { text: e.target.value })}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              onSplit(seg.id, e.currentTarget.selectionStart);
            }
          }}
        />
      </div>
      <div className="seg-actions">
        <button
          className="icon-btn"
          title={`${t('editor.split')} (Ctrl+Enter)`}
          aria-label={t('editor.split')}
          onClick={() => onSplit(seg.id, textRef.current?.selectionStart ?? Math.floor(seg.text.length / 2))}
        >
          <Icon name="scissors" size={15} />
        </button>
        <button
          className="icon-btn"
          title={t('editor.merge')}
          aria-label={t('editor.merge')}
          disabled={isLast}
          onClick={() => onMerge(seg.id)}
        >
          <Icon name="merge" size={15} />
        </button>
        <button className="icon-btn" title={t('editor.insert')} aria-label={t('editor.insert')} onClick={() => onInsert(seg.id)}>
          <Icon name="plus" size={15} />
        </button>
        <button className="icon-btn danger" title={t('editor.delete')} aria-label={t('editor.delete')} onClick={() => onDelete(seg.id)}>
          <Icon name="trash" size={15} />
        </button>
      </div>
    </li>
  );
});

function TimeInput({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? formatClock(value);
  const commit = () => {
    if (draft === null) return;
    const v = parseTimestamp(draft);
    if (Number.isFinite(v)) onCommit(Math.round(v * 1000) / 1000);
    setDraft(null);
  };
  return (
    <input
      className={`time ${draft !== null && !Number.isFinite(parseTimestamp(draft)) ? 'invalid' : ''}`}
      aria-label={label}
      title={label}
      value={shown}
      inputMode="decimal"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setDraft(null);
      }}
    />
  );
}
