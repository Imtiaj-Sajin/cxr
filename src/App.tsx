import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { I18nProvider } from './i18n-context';
import { translate, detectLang, type Lang, type MessageKey } from './lib/i18n';
import { Landing, MEDIA_ACCEPT } from './components/Landing';
import { Setup } from './components/Setup';
import { Progress, initialProgress, formatDuration, type ProgressState } from './components/Progress';
import { Player, type PlayerHandle } from './components/Player';
import { SegmentList } from './components/SegmentList';
import { Toolbar } from './components/Toolbar';
import { ExportPanel } from './components/ExportPanel';
import { Icon } from './components/Icon';
import { Waveform } from './components/Waveform';
import { emptyHistory, historyReducer } from './state';
import { decodeFile, detectWebGPU, type DecodedAudio } from './lib/audio';
import { createEngine } from './lib/engine';
import { findModel, DEFAULT_MODEL_ID } from './lib/models';
import { parseSubtitles } from './lib/subtitles';
import { nonBanglaShare, normalizeDanda, tidySegments, toBanglaDigits, toLatinDigits } from './lib/postprocess';
import {
  activeIndex,
  deleteSegment,
  insertAfter,
  mergeWithNext,
  replaceAll,
  shiftAll,
  splitSegment,
  updateSegment,
} from './lib/edit';
import { clearProject, loadPrefs, loadProject, savePrefs, saveProject, type Prefs, type SavedProject } from './lib/storage';
import type { Segment } from './lib/types';
import type { WorkerEvent } from './lib/protocol';

type Phase = 'landing' | 'setup' | 'editor';

interface Media {
  url: string;
  kind: 'video' | 'audio';
}

interface Outcome {
  kind: 'done' | 'cancelled';
  elapsedMs: number;
}

const REPO_URL = 'https://github.com/Imtiaj-Sajin/cxr';

const DEFAULT_PREFS: Prefs = {
  lang: detectLang(),
  modelId: DEFAULT_MODEL_ID,
  maxLineChars: 42,
  banglaDigits: false,
  danda: false,
  speechLanguage: 'bengali',
  task: 'transcribe',
};

function isSubtitleFile(file: File): boolean {
  return /\.(srt|vtt)$/i.test(file.name) || file.type === 'text/vtt';
}

export default function App() {
  const [prefs, setPrefs] = useState<Prefs>(() => {
    const loaded = loadPrefs(DEFAULT_PREFS);
    // `?model=owner/name` preselects a model (handy for sharing a link to a custom model).
    const fromUrl = new URLSearchParams(location.search).get('model');
    return fromUrl ? { ...loaded, modelId: fromUrl } : loaded;
  });
  const lang: Lang = prefs.lang;
  const t = useCallback((key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);

  const [phase, setPhase] = useState<Phase>('landing');
  const [fileName, setFileName] = useState('');
  const [media, setMedia] = useState<Media | null>(null);
  const [audio, setAudio] = useState<DecodedAudio | null>(null);
  const [decoding, setDecoding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webgpu, setWebgpu] = useState<boolean | null>(null);
  const [saved, setSaved] = useState<SavedProject | null>(() => loadProject());

  const [history, dispatch] = useReducer(historyReducer, emptyHistory);
  const segments = history.present;
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<ProgressState>(initialProgress);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [time, setTime] = useState(0);
  const [savedFlash, setSavedFlash] = useState(false);

  const engineRef = useRef(createEngine());
  const playerRef = useRef<PlayerHandle>(null);
  const attachRef = useRef<HTMLInputElement>(null);
  const lastEdit = useRef<{ id: string; at: number } | null>(null);
  const decodeToken = useRef(0);
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const prefsLangRef = useRef(lang);
  prefsLangRef.current = lang;

  useEffect(() => {
    void detectWebGPU().then(setWebgpu);
    const engine = engineRef.current;
    return () => engine.dispose();
  }, []);

  useEffect(() => savePrefs(prefs), [prefs]);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = `${translate(lang, 'app.name')} · ${translate(lang, 'app.tagline')}`;
  }, [lang]);

  // Autosave text and timings (never the media) shortly after each change.
  useEffect(() => {
    if (phase !== 'editor' || segments.length === 0) return;
    const id = setTimeout(() => {
      saveProject({ fileName, segments, savedAt: Date.now() });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1200);
    }, 600);
    return () => clearTimeout(id);
  }, [segments, fileName, phase]);

  // Flush immediately when the tab is closed or reloaded, so the last edit is never lost.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const fileNameRef = useRef(fileName);
  fileNameRef.current = fileName;
  useEffect(() => {
    const flush = () => {
      if (phaseRef.current === 'editor' && segmentsRef.current.length > 0) {
        saveProject({ fileName: fileNameRef.current, segments: segmentsRef.current, savedAt: Date.now() });
      }
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  // Free the object URL when media changes.
  useEffect(() => () => void (media && URL.revokeObjectURL(media.url)), [media]);

  const updatePrefs = useCallback((patch: Partial<Prefs>) => setPrefs((p) => ({ ...p, ...patch })), []);

  const loadMedia = useCallback(
    async (file: File, attachOnly: boolean) => {
      setError(null);
      // The whole file is read into memory to decode its audio; very large files can
      // exhaust a tab's memory, so stop early with a clear message.
      const MAX_GB = 2;
      if (file.size > MAX_GB * 1024 ** 3) {
        setError(t('error.tooLarge', { size: (file.size / 1024 ** 3).toFixed(1), max: MAX_GB }));
        return;
      }
      const kind: Media['kind'] = file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|opus|flac)$/i.test(file.name) ? 'audio' : 'video';
      setMedia({ url: URL.createObjectURL(file), kind });
      if (attachOnly) return;
      setFileName(file.name);
      setAudio(null);
      setOutcome(null);
      setPhase('setup');
      setDecoding(true);
      // Ignore a slow decode that finishes after the user already picked another file.
      const token = ++decodeToken.current;
      try {
        const decoded = await decodeFile(file);
        if (token === decodeToken.current) setAudio(decoded);
      } catch {
        if (token === decodeToken.current) setError(t('error.decode'));
      } finally {
        if (token === decodeToken.current) setDecoding(false);
      }
    },
    [t],
  );

  const onFile = useCallback(
    async (file: File) => {
      if (isSubtitleFile(file)) {
        const parsed = parseSubtitles(await file.text());
        dispatch({ type: 'reset', segments: parsed });
        setFileName(file.name);
        setOutcome(null);
        setPhase('editor');
        return;
      }
      // Re-attaching media to a resumed project keeps the subtitles.
      const attachOnly = phase === 'editor' && !media && segmentsRef.current.length > 0;
      await loadMedia(file, attachOnly);
    },
    [phase, media, loadMedia],
  );

  const onEvent = useCallback((e: WorkerEvent) => {
    switch (e.type) {
      case 'stage':
        setProgress((p) => ({ ...p, stage: e.stage, transcribeStartedAt: e.stage === 'transcribing' ? Date.now() : p.transcribeStartedAt }));
        break;
      case 'load-progress':
        setProgress((p) => ({ ...p, loaded: e.loaded, total: e.total }));
        break;
      case 'ready':
        setProgress((p) => ({ ...p, device: e.device, fromCache: e.fromCache }));
        break;
      case 'plan':
        setProgress((p) => ({ ...p, pieces: e.pieces, speechSeconds: e.speechSeconds }));
        break;
      case 'segments':
        dispatch({ type: 'append', segments: e.segments });
        setProgress((p) => ({ ...p, done: e.index + 1, processedSeconds: e.processedSeconds }));
        break;
      case 'done':
        setWorking(false);
        dispatch({ type: 'transform', fn: tidySegments, record: false });
        setOutcome({ kind: e.cancelled ? 'cancelled' : 'done', elapsedMs: e.elapsedMs });
        break;
      case 'error':
        setWorking(false);
        setError(translate(prefsLangRef.current, 'error.model', { message: e.message }));
        // Nothing transcribed yet: go back to the setup screen so the user can retry or
        // pick another model instead of landing in an empty editor.
        if (segmentsRef.current.length === 0) setPhase('setup');
        break;
    }
  }, []);

  const start = useCallback(() => {
    if (!audio) return;
    const model = findModel(prefs.modelId);
    setError(null);
    setOutcome(null);
    setProgress({ ...initialProgress });
    dispatch({ type: 'reset', segments: [] });
    setWorking(true);
    setPhase('editor');
    engineRef.current.start(
      {
        type: 'transcribe',
        audio: audio.samples,
        sampleRate: audio.sampleRate,
        modelId: model.id,
        dtype: model.dtype,
        device: 'auto',
        language: prefs.speechLanguage,
        task: prefs.task,
        timestamps: model.timestamps,
        cueOptions: { maxLineChars: prefs.maxLineChars, maxLines: 2 },
        localModelPath: new URLSearchParams(location.search).get('localModels') ?? undefined,
      },
      onEvent,
    );
  }, [audio, prefs, onEvent]);

  const cancel = useCallback(() => {
    engineRef.current.cancel();
    setWorking(false);
    setOutcome({ kind: 'cancelled', elapsedMs: 0 });
  }, []);

  const reset = useCallback(() => {
    decodeToken.current++;
    setDecoding(false);
    if (working) engineRef.current.cancel();
    setWorking(false);
    setPhase('landing');
    setMedia(null);
    setAudio(null);
    setOutcome(null);
    setError(null);
    setSaved(loadProject());
    dispatch({ type: 'reset', segments: [] });
  }, [working]);

  // --- Editing callbacks (stable, so memoised rows do not re-render needlessly) ---
  const edit = useCallback((fn: (list: Segment[]) => Segment[]) => dispatch({ type: 'transform', fn }), []);

  const onChange = useCallback((id: string, patch: Partial<Omit<Segment, 'id'>>) => {
    // Typing in the same cue within a moment is one undo step, not one per keystroke.
    const now = Date.now();
    const typing = 'text' in patch && lastEdit.current?.id === id && now - lastEdit.current.at < 1500;
    lastEdit.current = 'text' in patch ? { id, at: now } : null;
    dispatch({ type: 'transform', fn: (l) => updateSegment(l, id, patch), record: !typing });
  }, []);
  const onSplit = useCallback((id: string, offset: number) => edit((l) => splitSegment(l, id, offset)), [edit]);
  const onMerge = useCallback((id: string) => edit((l) => mergeWithNext(l, id)), [edit]);
  const onInsert = useCallback((id: string | null) => edit((l) => insertAfter(l, id)), [edit]);
  const onDelete = useCallback((id: string) => edit((l) => deleteSegment(l, id)), [edit]);
  const onPlay = useCallback((seg: Segment) => playerRef.current?.playRange(seg.start, seg.end), []);
  const onTime = useCallback((v: number) => setTime(v), []);

  // Global undo/redo when not typing in a field (fields keep their native undo).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const activeIdx = useMemo(() => activeIndex(segments, time), [segments, time]);
  // Only judged right after a Bangla transcription, not for imported subtitle files.
  const wrongScript =
    outcome?.kind === 'done' &&
    prefs.speechLanguage === 'bengali' &&
    prefs.task === 'transcribe' &&
    segments.length >= 2 &&
    nonBanglaShare(segments) > 0.4;

  const outcomeText = !outcome
    ? null
    : outcome.kind === 'cancelled'
      ? t('done.cancelled', { count: segments.length })
      : segments.length === 0
        ? t('done.noSpeech')
        : t('done.title', { count: segments.length, time: formatDuration(outcome.elapsedMs / 1000, lang) });

  return (
    <I18nProvider lang={lang}>
      <div className="app">
        <header className="header">
          <button className="brand" onClick={reset} aria-label="Kotha home">
            <span className="logo" aria-hidden="true">
              ক
            </span>
            <span className="brand-text">
              <strong>{t('app.name')}</strong>
              <small>{t('app.tagline')}</small>
            </span>
          </button>
          <div className="header-actions">
            {phase === 'editor' && (
              <button className="btn ghost small" onClick={reset}>
                <Icon name="plus" size={14} /> {t('editor.new')}
              </button>
            )}
            <button className="btn ghost small" onClick={() => updatePrefs({ lang: lang === 'bn' ? 'en' : 'bn' })} data-testid="lang-toggle">
              <Icon name="globe" size={14} /> {t('nav.lang')}
            </button>
          </div>
        </header>

        {error && (
          <div className="banner error" role="alert">
            <span>{error}</span>
            <button className="icon-btn" onClick={() => setError(null)} aria-label={t('common.close')}>
              <Icon name="x" size={16} />
            </button>
          </div>
        )}

        {phase === 'landing' && (
          <Landing
            onFile={onFile}
            saved={saved}
            onResume={() => {
              if (!saved) return;
              dispatch({ type: 'reset', segments: saved.segments });
              setFileName(saved.fileName);
              setPhase('editor');
            }}
            onDiscard={() => {
              clearProject();
              setSaved(null);
            }}
          />
        )}

        {phase === 'setup' && (
          <Setup
            fileName={fileName}
            duration={audio?.duration ?? null}
            decoding={decoding}
            webgpu={webgpu}
            modelId={prefs.modelId}
            onModelChange={(id) => updatePrefs({ modelId: id })}
            speechLanguage={prefs.speechLanguage}
            onSpeechLanguageChange={(v) => updatePrefs({ speechLanguage: v })}
            task={prefs.task}
            onTaskChange={(v) => updatePrefs({ task: v })}
            maxLineChars={prefs.maxLineChars}
            onMaxLineCharsChange={(n) => updatePrefs({ maxLineChars: n })}
            onStart={start}
            onChangeFile={reset}
          />
        )}

        {phase === 'editor' && (
          <main className="editor">
            {working && <Progress p={progress} onCancel={cancel} />}
            {!working && outcomeText && (
              <div className={`banner ${outcome?.kind === 'done' && segments.length > 0 ? 'success' : 'info'}`} role="status" data-testid="outcome">
                <Icon name={outcome?.kind === 'done' ? 'check' : 'clock'} size={18} />
                <span>{outcomeText}</span>
              </div>
            )}

            {!working && wrongScript && (
              <div className="banner warn" role="status" data-testid="wrong-script">
                <Icon name="chip" size={18} />
                <span>{t('done.wrongScript')}</span>
              </div>
            )}

            <div className="editor-grid">
              <div className="left">
                {media ? (
                  <>
                    <Player ref={playerRef} url={media.url} kind={media.kind} segments={segments} onTime={onTime} />
                    {audio && (
                      <Waveform
                        samples={audio.samples}
                        sampleRate={audio.sampleRate}
                        segments={segments}
                        time={time}
                        onSeek={(v) => playerRef.current?.seek(v)}
                      />
                    )}
                  </>
                ) : (
                  <div className="card no-media">
                    <p className="muted">{t('editor.noMedia')}</p>
                    <button className="btn" onClick={() => attachRef.current?.click()}>
                      <Icon name="video" size={16} /> {t('editor.attachMedia')}
                    </button>
                    <input
                      ref={attachRef}
                      type="file"
                      hidden
                      accept={MEDIA_ACCEPT}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void loadMedia(f, true);
                        e.target.value = '';
                      }}
                    />
                  </div>
                )}
                <ExportPanel segments={segments} fileName={fileName} media={media} disabled={working} />
              </div>

              <section className="card list-card" aria-label={t('editor.title')}>
                <div className="list-head">
                  <h2>
                    {t('editor.title')} <span className="count">{segments.length}</span>
                  </h2>
                  <span className={`saved ${savedFlash ? 'show' : ''}`}>
                    <Icon name="check" size={14} /> {t('editor.saved')}
                  </span>
                </div>
                <Toolbar
                  canUndo={history.past.length > 0}
                  canRedo={history.future.length > 0}
                  onUndo={() => dispatch({ type: 'undo' })}
                  onRedo={() => dispatch({ type: 'redo' })}
                  onReplaceAll={(find, rep) => {
                    const { list, count } = replaceAll(segmentsRef.current, find, rep);
                    if (count > 0) dispatch({ type: 'set', segments: list });
                    return count;
                  }}
                  onShift={(d) => edit((l) => shiftAll(l, d))}
                  onBanglaDigits={() => edit((l) => l.map((s) => ({ ...s, text: toBanglaDigits(s.text) })))}
                  onLatinDigits={() => edit((l) => l.map((s) => ({ ...s, text: toLatinDigits(s.text) })))}
                  onDanda={() => edit((l) => l.map((s) => ({ ...s, text: normalizeDanda(s.text) })))}
                  disabled={working}
                />
                <div className="list-scroll">
                  <SegmentList
                    segments={segments}
                    activeIdx={activeIdx}
                    followPlayback={!working}
                    onChange={onChange}
                    onSplit={onSplit}
                    onMerge={onMerge}
                    onInsert={onInsert}
                    onDelete={onDelete}
                    onPlay={onPlay}
                  />
                </div>
              </section>
            </div>
          </main>
        )}

        <footer className="footer">
          <p>
            <Icon name="lock" size={14} /> {t('footer.privacy')}
          </p>
          <p className="muted">
            {t('footer.madeBy', { name: 'Imtiaj Sajin' })} ·{' '}
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              {t('footer.source')}
            </a>
          </p>
        </footer>
      </div>
    </I18nProvider>
  );
}
