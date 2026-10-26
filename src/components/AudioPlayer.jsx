// Раскрытый проигрыватель аудиокниги — на весь экран, выезжает снизу из панели AudioBar.
// Сверху ручка и название главы; в центре — стихи главы крупно, «караоке»: звучащий стих чёткий, соседние
// полупрозрачные и размытые. Текст сам держит звучащий стих посередине; человек может листать пальцем — тогда
// размытие снимается, а через несколько секунд без нажатия текст возвращается к звучащему стиху.
// Нажатие на стих — запись идёт с начала этого стиха (по разметке времени стихов, как ⏮/⏭).
// Ниже — перемотка с временем, ⏮ ▶/⏸ ⏭, громкость, скорость, таймер сна, скачивание книги, закрытие.
// Закрывается свайпом вниз за ручку или шапку, стрелкой вниз и клавишей Escape.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, X, Loader2, ChevronDown, Volume1, Volume2, Moon } from 'lucide-react';
import { pauseAudio, resumeAudio, stopAudio, stepVerse, setRate, setSleep, playVerse, seekChapter, useAudioTime, canSetVolume } from '../core/audio.js';
import { getBook, getModule } from '../core/modules.js';
import { plainText } from '../core/verseMarkup.js';
import { bookMeta } from '../core/books.js';
import { DownloadButton, DownloadNote, RATES } from './AudioBar.jsx';
import { t } from '../core/i18n.js';

const reduceMotion = () => document.documentElement.classList.contains('no-anim') || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const clock = (s) => {
  const v = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const ss = String(v % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};
const SP_MAX = 120; // минут на ленте таймера
const SP_STEP = 12; // px на минуту

const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:00` : `${m}:00`);

// Таймер сна: лента минут, как у таймера в телефоне, — листается пальцем, выбранная минута под треугольником
function SleepPicker({ initial, active, onPick, onClose }) {
  const [min, setMin] = useState(initial);
  const ruler = useRef(null);
  useLayoutEffect(() => {
    if (ruler.current) ruler.current.scrollLeft = initial * SP_STEP;
  }, []);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && (e.stopPropagation(), onClose());
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  const onScroll = () => setMin(Math.max(0, Math.min(SP_MAX, Math.round(ruler.current.scrollLeft / SP_STEP))));
  const moveTo = (m) => ruler.current?.scrollTo({ left: Math.max(0, Math.min(SP_MAX, m)) * SP_STEP, behavior: reduceMotion() ? 'auto' : 'smooth' });
  const onKey = (e) => {
    const d = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -5, PageUp: 5 }[e.key];
    if (d) {
      e.preventDefault();
      moveTo(min + d);
    }
  };
  return (
    <div className="sp-layer" onClick={onClose}>
      <div className="sp" role="dialog" aria-label={t('Таймер сна')} onClick={(e) => e.stopPropagation()}>
        <div className="sp-ruler-wrap">
          <div
            className="sp-ruler"
            ref={ruler}
            onScroll={onScroll}
            tabIndex={0}
            role="slider"
            aria-label={t('Таймер сна')}
            aria-valuemin={0}
            aria-valuemax={SP_MAX}
            aria-valuenow={min}
            aria-valuetext={t('{n} мин', { n: min })}
            onKeyDown={onKey}
          >
            <div className="sp-track" style={{ '--sp-step': `${SP_STEP}px` }}>
              {Array.from({ length: SP_MAX + 1 }, (_, m) => (
                <span key={m} className={`sp-tick ${m % 5 === 0 ? 'big' : ''}`} onClick={() => moveTo(m)}>
                  {m % 5 === 0 && <b>{m}</b>}
                </span>
              ))}
            </div>
          </div>
          <span className="sp-mark" aria-hidden="true" />
        </div>
        <div className="sp-row">
          <button className="sp-start" disabled={!min} onClick={() => onPick('min', min)}>
            {t('Запустить таймер')}
          </button>
          <span className="sp-time" aria-hidden="true">
            {fmtMin(min)}
          </span>
        </div>
        <div className="sp-row sp-more">
          <button className="ap-chip" onClick={() => onPick('chapter')}>
            {t('До конца главы')}
          </button>
          {active && (
            <button className="ap-chip" onClick={() => onPick(null)}>
              {t('Выключить таймер')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
const BACK_AFTER = 3500; // через сколько после ручной прокрутки текст возвращается к звучащему стиху

export default function AudioPlayer({ a, onClosed, dl, note, setNote, vol, setVol, sleepLeft }) {
  const ref = a.ref;
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(null);
  const [chap, setChap] = useState(null); // { key, verses: [[номер, текст]] }
  const [names, setNames] = useState({ bible: '', rec: '' });
  const [manual, setManual] = useState(false); // человек листает текст сам
  const [seek, setSeek] = useState(null); // положение ползунка, пока его тянут
  const dlg = useRef(null);
  const list = useRef(null);
  const seekEl = useRef(null);
  const drag = useRef(null);
  const closingRef = useRef(false);
  const manualRef = useRef(false);
  const backTimer = useRef(null);
  const touching = useRef(false);
  const wheelAt = useRef(0);
  const placed = useRef(false); // первый раз ставим звучащий стих посередине без анимации
  const time = useAudioTime();
  const volOk = useMemo(canSetVolume, []);

  const closedCb = useRef(onClosed);
  closedCb.current = onClosed;
  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setDragY(null);
    setClosing(true);
    document.documentElement.classList.remove('player-open');
    setTimeout(() => closedCb.current(), reduceMotion() ? 0 : 300);
  }, []);

  // Нижнее меню вкладок прячется, пока проигрыватель раскрыт
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('player-open');
    return () => root.classList.remove('player-open');
  }, []);

  // Фокус внутрь окна, Escape закрывает, Tab не уходит за пределы окна; при закрытии фокус возвращается
  useEffect(() => {
    const prev = document.activeElement;
    dlg.current?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        close();
      } else if (e.key === 'Tab' && dlg.current) {
        const items = [...dlg.current.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex="0"]')].filter((x) => x.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dlg.current)) (e.preventDefault(), last.focus());
        else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
        else if (!dlg.current.contains(document.activeElement)) (e.preventDefault(), first.focus());
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (prev && document.contains(prev)) prev.focus?.({ preventScroll: true });
    };
  }, [close]);

  // Текст главы — из того перевода, к которому привязана запись (как в окне чтения)
  const key = ref ? `${a.moduleId}|${ref.book}.${ref.chapter}` : '';
  useEffect(() => {
    if (!ref) return;
    let off = false;
    getBook(a.moduleId, ref.book).then((book) => {
      if (off) return;
      const ch = book?.chapters?.[ref.chapter - 1] || [];
      setChap({ key, verses: ch.map((x, i) => (x ? [i + 1, plainText(String(x))] : null)).filter(Boolean) });
    });
    return () => (off = true);
  }, [key]);
  useEffect(() => {
    let off = false;
    Promise.all([getModule(a.moduleId), a.source === 'tts' ? null : getModule(a.source)]).then(([bible, rec]) => {
      if (!off) setNames({ bible: bible?.name || '', rec: a.source === 'tts' ? t('ИИ-диктор') : rec?.title || rec?.name || '' });
    });
    return () => (off = true);
  }, [a.moduleId, a.source]);

  const verses = chap?.key === key ? chap.verses : [];
  const active = ref ? verses.findIndex(([n]) => n === ref.verse) : -1;

  // Отступы сверху и снизу — чтобы и первый, и последний стих могли встать посередине
  useLayoutEffect(() => {
    const box = list.current;
    if (!box) return;
    const ro = new ResizeObserver(() => box.style.setProperty('--ap-pad', `${Math.round(box.clientHeight * 0.5)}px`));
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  const toActive = useCallback((smooth) => {
    const box = list.current;
    const el = box?.querySelector('.ap-verse.on');
    if (!box || !el) return;
    const top = el.offsetTop - (box.clientHeight - el.offsetHeight) / 2;
    box.scrollTo({ top: Math.max(0, top), behavior: smooth && !reduceMotion() ? 'smooth' : 'auto' });
  }, []);

  // Сменился звучащий стих — плавно ведём его к середине (если человек сейчас не листает сам)
  useLayoutEffect(() => {
    if (active < 0 || manualRef.current) return;
    toActive(placed.current);
    placed.current = true;
  }, [active, verses, toActive]);

  const endManual = useCallback(() => {
    clearTimeout(backTimer.current);
    manualRef.current = false;
    setManual(false);
  }, []);
  // Человек листает сам: размытие снимается, автопрокрутка ждёт; через BACK_AFTER без касаний — назад к стиху
  const onUserScroll = () => {
    if (!manualRef.current) {
      manualRef.current = true;
      setManual(true);
    }
    clearTimeout(backTimer.current);
    backTimer.current = setTimeout(() => {
      if (touching.current) return onUserScroll();
      endManual();
      toActive(true);
    }, BACK_AFTER);
  };
  const onScroll = () => {
    if (touching.current || manualRef.current || Date.now() - wheelAt.current < 400) onUserScroll();
  };
  useEffect(() => () => clearTimeout(backTimer.current), []);

  const pick = (n) => {
    endManual();
    playVerse({ book: ref.book, chapter: ref.chapter, verse: n });
  };
  // Стрелки вверх/вниз — между стихами (в порядке Tab стоит только звучащий стих)
  const onListKey = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...list.current.querySelectorAll('.ap-verse')];
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const next = items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    onUserScroll();
    next.focus();
    next.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
  };

  // Свайп вниз за ручку или шапку — окно едет за пальцем; отпустили ниже порога — закрывается
  const onDown = (e) => {
    if ((e.button !== undefined && e.button !== 0) || e.target.closest('button')) return;
    drag.current = { y: e.clientY, t: Date.now() };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!drag.current) return;
    setDragY(Math.max(0, e.clientY - drag.current.y));
  };
  const onUp = (e) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const dy = e.clientY - d.y;
    const v = dy / Math.max(1, Date.now() - d.t);
    if (dy > 110 || (dy > 40 && v > 0.6)) close();
    else setDragY(null);
  };

  // Перемотка: пока тянут — только ползунок; отпустили — запись перематывается
  const recorded = a.source !== 'tts';
  const len = recorded ? time.len : verses.length;
  const pos = seek ?? (recorded ? time.pos : active + 1);
  useEffect(() => {
    const el = seekEl.current;
    if (!el) return;
    const commit = () => {
      const v = +el.value;
      setSeek(null);
      if (a.source !== 'tts') seekChapter(v);
      else if (verses[v - 1]) pick(verses[v - 1][0]);
    };
    el.addEventListener('change', commit);
    return () => el.removeEventListener('change', commit);
  });

  const sleepLabel = !a.sleep ? t('Выкл') : a.sleep.kind === 'chapter' ? t('Конец главы') : t('{n} мин', { n: sleepLeft || a.sleep.minutes });
  const [sleepOpen, setSleepOpen] = useState(false);
  const nextRate = () => setRate(RATES[(RATES.indexOf(a.rate) + 1) % RATES.length] ?? 1);

  const title = ref ? `${bookMeta(ref.book).name} ${ref.chapter}` : '';
  const pct = len > 0 ? Math.max(0, Math.min(100, ((recorded ? pos : pos - 1) / (recorded ? len : Math.max(1, len - 1))) * 100)) : 0;

  return (
    <div className={`ap-layer ${closing ? 'closing' : ''}`}>
      <div
        ref={dlg}
        className={`ap ${dragY != null ? 'dragging' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${t('Аудиокнига')}: ${title}`}
        tabIndex={-1}
        style={dragY != null ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        <div className="ap-head" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <span className="ap-grip" aria-hidden="true" />
          <div className="ap-head-row">
            <button className="ap-icon" onClick={close} aria-label={t('Свернуть проигрыватель')}>
              <ChevronDown size={26} />
            </button>
            <div className="ap-title">
              <strong>{title}</strong>
              <span>{[names.bible, names.rec].filter(Boolean).join(' · ')}</span>
            </div>
            <span className="ap-icon-gap" aria-hidden="true" />
          </div>
        </div>

        <div
          ref={list}
          className={`ap-lyrics ${manual ? 'manual' : ''}`}
          onScroll={onScroll}
          onTouchStart={() => (touching.current = true)}
          onTouchEnd={() => (touching.current = false)}
          onTouchCancel={() => (touching.current = false)}
          onWheel={() => ((wheelAt.current = Date.now()), onUserScroll())}
          onKeyDown={onListKey}
        >
          {verses.map(([n, text], i) => {
            const d = active < 0 ? 4 : Math.min(4, Math.abs(i - active));
            return (
              <button key={n} className={`ap-verse ${d === 0 ? 'on' : ''}`} data-d={d} tabIndex={d === 0 || (active < 0 && i === 0) ? 0 : -1} onClick={() => pick(n)} aria-current={d === 0 ? 'true' : undefined}>
                <span className="ap-vn" aria-hidden="true">
                  {n}
                </span>
                {text}
              </button>
            );
          })}
        </div>

        <div className="ap-controls">
          {a.error && <div className="ap-error">{a.error}</div>}
          <DownloadNote note={note} setNote={setNote} />
          <div className="ap-seek">
            <input
              ref={seekEl}
              type="range"
              min={recorded ? 0 : 1}
              max={Math.max(recorded ? 1 : 1, len)}
              step={recorded ? 0.1 : 1}
              value={Math.min(pos, Math.max(1, len))}
              disabled={!len}
              onChange={(e) => setSeek(+e.target.value)}
              aria-label={t('Место в записи')}
              aria-valuetext={recorded ? t('{cur} из {total}', { cur: clock(pos), total: clock(len) }) : t('Стих {n} из {total}', { n: ref?.verse ?? pos, total: len })}
              style={{ '--p': `${pct}%` }}
            />
            <div className="ap-times" aria-hidden="true">
              {recorded ? (
                <>
                  <span>{clock(pos)}</span>
                  <span>−{clock(Math.max(0, len - pos))}</span>
                </>
              ) : (
                <span>{t('Стих {n} из {total}', { n: ref?.verse ?? '', total: len })}</span>
              )}
            </div>
          </div>

          <div className="ap-transport">
            <button className="ap-btn" onClick={() => stepVerse(-1)} aria-label={t('Предыдущий стих')}>
              <SkipBack size={28} fill="currentColor" />
            </button>
            <button className="ap-btn ap-play" onClick={() => (a.playing ? pauseAudio() : resumeAudio())} aria-label={a.playing ? t('Пауза') : t('Слушать')}>
              {a.loading ? <Loader2 size={34} className="spin" /> : a.playing ? <Pause size={34} fill="currentColor" /> : <Play size={34} fill="currentColor" />}
            </button>
            <button className="ap-btn" onClick={() => stepVerse(1)} aria-label={t('Следующий стих')}>
              <SkipForward size={28} fill="currentColor" />
            </button>
          </div>

          {volOk && (
            <div className="ap-volume">
              <Volume1 size={18} aria-hidden="true" />
              <input type="range" min={0} max={1} step={0.01} value={vol} onChange={(e) => setVol(+e.target.value)} aria-label={t('Громкость')} aria-valuetext={`${Math.round(vol * 100)}%`} style={{ '--p': `${vol * 100}%` }} />
              <Volume2 size={18} aria-hidden="true" />
            </div>
          )}

          <div className="ap-extras">
            <button className="ap-chip" onClick={nextRate} aria-label={`${t('Скорость')}: ${a.rate}×`}>
              {a.rate}×
            </button>
            <button className={`ap-chip ${a.sleep ? 'on' : ''}`} onClick={() => setSleepOpen(true)} aria-haspopup="dialog" aria-label={`${t('Таймер сна')}: ${sleepLabel}`}>
              <Moon size={16} aria-hidden="true" />
              {a.sleep && <span>{sleepLabel}</span>}
            </button>
            {dl && <DownloadButton dl={dl} size={20} />}
            <button className="audio-btn" onClick={stopAudio} aria-label={t('Закрыть аудио')}>
              <X size={20} />
            </button>
          </div>
        </div>
        {sleepOpen && (
          <SleepPicker
            initial={a.sleep?.minutes || 15}
            active={!!a.sleep}
            onClose={() => setSleepOpen(false)}
            onPick={(kind, m) => {
              if (!kind) setSleep(null);
              else if (kind === 'chapter') setSleep('chapter');
              else setSleep('min', m);
              setSleepOpen(false);
            }}
          />
        )}
      </div>
    </div>
  );
}
