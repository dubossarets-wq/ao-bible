// Нижняя панель «аудиокниги»: ▶/⏸, предыдущий/следующий стих, текущее место, скорость, таймер сна,
// кнопка «скачать книгу» для прослушивания без интернета. Нет записи — сообщение об этом.
// Нажатие на свободную часть панели (или на место чтения) раскрывает проигрыватель на весь экран (AudioPlayer.jsx).
import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, X, SlidersHorizontal, Loader2, CornerUpLeft, Download, CheckCircle2, Sparkles } from 'lucide-react';
import { listenFrom } from '../core/listen.js';
import { useAudio, pauseAudio, resumeAudio, stopAudio, stepVerse, setRate, setSleep, resumeFollow, startAudio, setVolume } from '../core/audio.js';
import { downloadBook, isBookOffline, removeBook } from '../core/offlineAudio.js';
import { useApp } from '../App.jsx';
import { formatRef, bookMeta } from '../core/books.js';
import { usePersistentState } from '../core/storage.js';
import { Segmented } from './ui.jsx';
import AudioPlayer from './AudioPlayer.jsx';
import { t } from '../core/i18n.js';

export const RATES = [0.75, 1, 1.25, 1.5];
const mb = (b) => t('{n} МБ', { n: (b / 1048576).toFixed(b < 10485760 ? 1 : 0) });

// Скачивание звучащей книги, чтобы слушать без интернета. Одно состояние на обе кнопки — в панели и в
// раскрытом проигрывателе: прогресс загрузки виден в обоих видах.
function useBookDownload(audioId, book, onNote) {
  const [offline, setOffline] = useState(() => !!(audioId && book) && isBookOffline(audioId, book));
  const [prog, setProg] = useState(null); // доля 0..1
  useEffect(() => setOffline(!!(audioId && book) && isBookOffline(audioId, book)), [audioId, book]);
  const name = book ? bookMeta(book).name : '';
  const click = async () => {
    if (prog != null) return;
    if (offline) return onNote({ ok: true, text: t('«{book}» в телефоне — слушайте без интернета', { book: name }), remove: () => removeBook(audioId, book).then(() => (setOffline(false), onNote(null))) });
    setProg(0);
    onNote({ text: t('Скачиваю «{book}»…', { book: name }) });
    try {
      const bytes = await downloadBook(audioId, book, { onProgress: (done, total, b) => (setProg(done / total), onNote({ text: t('Скачиваю «{book}»: {done} из {total} · {size}', { book: name, done, total, size: mb(b) }) })) });
      setOffline(true);
      onNote({ ok: true, text: t('«{book}» скачана ({size})', { book: name, size: mb(bytes) }) });
    } catch (e) {
      onNote({ text: e.message });
    } finally {
      setProg(null);
    }
  };
  return { offline, prog, name, click };
}

// Кнопка рядом с настройками. Во время загрузки — круг прогресса, после — зелёная галочка
export function DownloadButton({ dl, size = 19 }) {
  const { offline, prog, name, click } = dl;
  const C = 2 * Math.PI * 14;
  return (
    <button className={`audio-btn dl ${offline ? 'ok' : ''}`} onClick={click} aria-label={offline ? t('{book} скачана для прослушивания без интернета', { book: name }) : t('Скачать {book} для прослушивания без интернета', { book: name })} title={offline ? t('Скачано') : t('Скачать книгу')}>
      {prog != null ? (
        <>
          <svg className="dl-ring" viewBox="0 0 32 32" aria-hidden="true">
            <circle className="bg" cx="16" cy="16" r="14" />
            <circle className="fg" cx="16" cy="16" r="14" strokeDasharray={C} strokeDashoffset={C * (1 - prog)} />
          </svg>
          <Download size={14} />
        </>
      ) : offline ? (
        <CheckCircle2 size={size} />
      ) : (
        <Download size={size} />
      )}
    </button>
  );
}

// Подпись о скачивании книги (под панелью и в раскрытом проигрывателе)
export function DownloadNote({ note, setNote }) {
  if (!note) return null;
  return (
    <div className={`audio-dl-note ${note.ok ? 'ok' : ''}`}>
      {note.text}
      {note.remove && (
        <button className="link-btn" onClick={note.remove}>
          {t('удалить')}
        </button>
      )}
      <button className="link-btn" onClick={() => setNote(null)}>
        {t('скрыть')}
      </button>
    </div>
  );
}

export default function AudioBar() {
  const a = useAudio();
  const { navigate, setSettings, panes } = useApp();
  const [opts, setOpts] = useState(false);
  const [note, setNote] = useState(null); // подпись о скачивании книги
  const [full, setFull] = useState(false); // раскрытый проигрыватель
  const [vol, setVol] = usePersistentState('audioVolume', 1);
  const [, tick] = useState(0);
  const bar = useRef(null);
  const swipe = useRef(null);
  const recorded = a.source !== 'tts' && a.source !== 'none';
  const dl = useBookDownload(recorded ? a.source : null, a.ref?.book, setNote);

  useEffect(() => setVolume(vol), [vol]);

  // Высота проигрывателя — в --audio-h: стрелки соседних глав встают над ним
  useEffect(() => {
    const el = bar.current;
    const root = document.documentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => root.style.setProperty('--audio-h', `${Math.round(el.getBoundingClientRect().height)}px`));
    ro.observe(el);
    return () => (ro.disconnect(), root.style.removeProperty('--audio-h'));
  }, [a.active]);

  // Обратный отсчёт таймера сна
  useEffect(() => {
    if (a.sleep?.kind !== 'min') return;
    const t = setInterval(() => tick((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, [a.sleep]);

  const canExpand = a.active && !!a.ref && a.source !== 'none' && !a.offerTts;
  // Запись выключили или для главы нет записи (предложение ИИ-диктора видно только в панели) — сворачиваем
  useEffect(() => {
    if (!canExpand && full) setFull(false);
  }, [canExpand, full]);

  if (!a.active) return null;
  const left = a.sleep?.kind === 'min' ? Math.max(1, Math.round((a.sleep.until - Date.now()) / 60000)) : null;
  const expand = () => canExpand && setFull(true);
  // Нажатие на свободную часть панели — раскрыть; кнопки работают как раньше
  const onMainClick = (e) => {
    if (e.target.closest('button')) return;
    expand();
  };
  // Свайп вверх по панели — тоже раскрыть
  const onDown = (e) => {
    if (e.target.closest('button, input')) return;
    swipe.current = { y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onUp = (e) => {
    const s = swipe.current;
    swipe.current = null;
    if (s && s.y - e.clientY > 36) expand();
  };

  return (
    <>
      <div ref={bar} className="audio-bar" role="region" aria-label={t('Аудиокнига')}>
        {/* Записи нет — предлагаем ИИ-диктора */}
        {a.offerTts && !a.playing && (
          <div className="audio-offer">
            <p>
              <strong>{a.error || t('Для этой главы нет аудиозаписи.')}</strong> {t('Включить ИИ-диктора? Он читает не так живо, как чтец.')}
            </p>
            <div className="audio-offer-btns">
              <button
                className="btn primary"
                onClick={() => {
                  setSettings({ ttsFallback: true });
                  startAudio({ pane: a.pane, moduleId: a.moduleId, ref: a.ref, source: 'tts' });
                }}
              >
                <Sparkles size={16} /> {t('Включить ИИ-диктора')}
              </button>
              <button className="btn" onClick={stopAudio}>
                {t('Не нужно')}
              </button>
            </div>
            <small>{t('Выключить: Настройки → Аудио.')}</small>
          </div>
        )}
        {!full && <DownloadNote note={note} setNote={setNote} />}
        {opts && (
          <div className="audio-opts">
            <Segmented id="audio-rate" label={t('Скорость')} value={a.rate} onChange={setRate} options={RATES.map((r) => [r, `${r}×`])} />
            <Segmented
              id="audio-sleep"
              label={t('Таймер сна')}
              value={a.sleep ? (a.sleep.kind === 'chapter' ? 'chapter' : String(a.sleep.minutes)) : 'off'}
              onChange={(v) => (v === 'off' ? setSleep(null) : v === 'chapter' ? setSleep('chapter') : setSleep('min', +v))}
              options={[
                ['off', t('Выкл')],
                ['15', t('{n} мин', { n: 15 })],
                ['30', t('{n} мин', { n: 30 })],
                ['60', t('{n} мин', { n: 60 })],
                ['chapter', t('Конец главы')],
              ]}
            />
          </div>
        )}
        <div className={`audio-main ${canExpand ? 'can-expand' : ''}`} onClick={onMainClick} onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => (swipe.current = null)}>
          <button className="audio-btn" onClick={() => stepVerse(-1)} aria-label={t('Предыдущий стих')}>
            <SkipBack size={20} />
          </button>
          <button className="audio-btn play" onClick={() => (a.playing ? pauseAudio() : resumeAudio())} aria-label={a.playing ? t('Пауза') : t('Слушать')}>
            {a.loading ? <Loader2 size={22} className="spin" /> : a.playing ? <Pause size={22} /> : <Play size={22} />}
          </button>
          <button className="audio-btn" onClick={() => stepVerse(1)} aria-label={t('Следующий стих')}>
            <SkipForward size={20} />
          </button>
          <div className="audio-info">
            {/* Человек ушёл в другое место — место чтения становится кнопкой «вернуться» */}
            {a.ref && !a.follow ? (
              <span className="audio-refs">
                <button className="audio-ref audio-back" onClick={() => (resumeFollow(), navigate(a.pane, a.ref, { flash: false, audio: true }))} title={t('К звучащему месту')}>
                  <CornerUpLeft size={14} /> {formatRef(a.ref)}
                </button>
                {/* под ней — «▶ Слушать отсюда»: читать с места, где человек сейчас в тексте */}
                {panes?.[a.pane] && (
                  <button className="audio-here" onClick={() => listenFrom(a.pane, panes[a.pane].moduleId, panes[a.pane].ref)}>
                    <Play size={11} /> {t('Слушать отсюда')} · {formatRef(panes[a.pane].ref)}
                  </button>
                )}
              </span>
            ) : canExpand ? (
              <button className="audio-ref audio-open" onClick={expand} aria-haspopup="dialog" aria-label={`${formatRef(a.ref)} — ${t('Открыть проигрыватель')}`}>
                {formatRef(a.ref)}
              </button>
            ) : (
              <span className="audio-ref">{a.ref ? formatRef(a.ref) : ''}</span>
            )}
            {((a.error && !a.offerTts) || left || a.sleep?.kind === 'chapter' || a.source === 'tts') && (
              <span className="audio-src">
                {a.error && !a.offerTts ? a.error : [a.source === 'tts' && t('ИИ-диктор'), left ? t('сон через {n} мин', { n: left }) : a.sleep?.kind === 'chapter' && t('до конца главы')].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
          {a.ref && recorded && <DownloadButton dl={dl} />}
          <button className={`audio-btn ${opts ? 'on' : ''}`} onClick={() => setOpts((v) => !v)} aria-label={t('Настройки чтения вслух')} aria-expanded={opts}>
            <SlidersHorizontal size={19} />
          </button>
          <button className="audio-btn" onClick={stopAudio} aria-label={t('Закрыть аудио')}>
            <X size={20} />
          </button>
        </div>
      </div>
      {full && canExpand && <AudioPlayer a={a} onClosed={() => setFull(false)} dl={recorded ? dl : null} note={note} setNote={setNote} vol={vol} setVol={setVol} sleepLeft={left} />}
    </>
  );
}
