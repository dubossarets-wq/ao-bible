// Полноценная панель чтения: своя навигация, свой перевод, свои словари и параллельные места.
// Долгое нажатие на стих включает режим выделения: вместо верхней панели — панель действий.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../App.jsx';
import ReaderToolbar from './ReaderToolbar.jsx';
import SelectionBar, { sortedRefs, quoteVerse, quoteLabel } from './SelectionBar.jsx';
import { listenFrom } from '../core/listen.js';
import { useAudio } from '../core/audio.js';
import { formatRef } from '../core/books.js';
import ChapterView from './ChapterView.jsx';
import MapPane from './MapPane.jsx';
import PlanView from './PlanView.jsx';
import { useLivePosition } from '../core/livePosition.js';
import { usePlan } from '../core/planStore.js';
import { dayUnits, unitDone, readingDone } from '../core/plans.js';
import { t } from '../core/i18n.js';
import { CornerUpLeft, X, Headphones, ScrollText, Heart, Copy, TextSelect, WholeWord, ChevronLeft, ChevronRight } from 'lucide-react';

// В режиме плана полоса показывает, сколько отрывков дня уже прочитано
function PlanProgress({ uid, day }) {
  const plan = usePlan(uid);
  if (!plan) return null;
  const units = dayUnits(plan, day);
  const pct = units.length ? (units.filter((u) => unitDone(plan, day, u.key)).length / units.length) * 100 : 0;
  const label = t('Прочитано за день: {pct}%', { pct: Math.round(pct) });
  return (
    <div className="read-progress plan" role="progressbar" aria-label={label} title={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

// Всегда под рукой: маленькая кнопка «Слушать с этого места» в правом нижнем углу.
// Пока текст прокручивают, она почти прозрачная (класс ставится напрямую, без перерисовки панели).
function ListenFab({ index, module, pane }) {
  const audio = useAudio();
  const ref = useLivePosition(index, pane.ref);
  const btn = useRef(null);
  useEffect(() => {
    const reader = btn.current?.closest('.reader');
    if (!reader) return;
    let timer = 0;
    const onScroll = () => {
      btn.current?.classList.add('dim');
      clearTimeout(timer);
      timer = setTimeout(() => btn.current?.classList.remove('dim'), 900);
    };
    reader.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      clearTimeout(timer);
      reader.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [audio.active]);
  if (audio.active) return null;
  return (
    <button ref={btn} className="listen-fab" onClick={() => listenFrom(index, module.id, ref)} aria-label={t('Слушать с этого места: {ref}', { ref: formatRef(ref) })} title={t('Слушать с {ref}', { ref: formatRef(ref) })}>
      <Headphones size={20} />
    </button>
  );
}

// Соседняя глава: круглые стрелки ‹ › внизу слева и справа (через границу книги — в соседнюю книгу).
// В режиме чтения уходят вместе с панелями при прокрутке вниз (класс bar-hidden у панели чтения).
function ChapterNav({ index, module, pane }) {
  const { navigate } = useApp();
  const ref = useLivePosition(index, pane.ref);
  const books = module?.books || [];
  const bi = books.findIndex((b) => b.id === ref.book);
  const chapters = bi < 0 ? 0 : books[bi].verses.length;
  const prev = bi < 0 ? null : ref.chapter > 1 ? { book: ref.book, chapter: ref.chapter - 1 } : bi > 0 ? { book: books[bi - 1].id, chapter: books[bi - 1].verses.length } : null;
  const next = bi < 0 ? null : ref.chapter < chapters ? { book: ref.book, chapter: ref.chapter + 1 } : bi < books.length - 1 ? { book: books[bi + 1].id, chapter: 1 } : null;
  const go = (r) => navigate(index, { ...r, verse: 1 }, { flash: false });
  const name = (r) => formatRef({ ...r, verse: 1 }).replace(/:1$/, '');
  // Свайп по тексту влево — следующая глава, вправо — предыдущая (текст идёт за пальцем, коротко — возвращается)
  const nav = useRef({});
  nav.current = { prev, next, go };
  useEffect(() => {
    const sc = document.querySelector(`.pane-slot.${index === 0 ? 'first' : 'second'} .reader .scroller`);
    if (!sc) return;
    let s = null;
    const col = () => sc.querySelector('.text-col');
    const reset = (anim) => {
      const c = col();
      if (!c) return;
      c.style.transition = anim ? 'transform .2s ease, opacity .2s ease' : '';
      c.style.transform = '';
      c.style.opacity = '';
    };
    const onStart = (e) => {
      const t0 = e.touches[0];
      const busy = e.touches.length > 1 || document.querySelector('.sheet, .selection-bar, .word-pop, .tour, .player-full') || sc.classList.contains('selecting');
      const edge = t0.clientX < 24 || t0.clientX > innerWidth - 24; // у края — системные жесты телефона
      s = busy || edge ? null : { x: t0.clientX, y: t0.clientY, t: Date.now(), dir: 0 };
    };
    const onMove = (e) => {
      if (!s) return;
      if (e.touches.length > 1) return reset(false), (s = null);
      const dx = e.touches[0].clientX - s.x;
      const dy = e.touches[0].clientY - s.y;
      if (!s.dir) {
        if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
        s.dir = Math.abs(dx) > Math.abs(dy) * 1.6 ? 1 : -1; // -1 — прокрутка, не трогаем
      }
      // текст за пальцем не сдвигается (по просьбе владельца): глава меняется только после отпускания — в onEnd
    };
    const onEnd = (e) => {
      if (!s) return;
      const st = s;
      s = null;
      if (st.dir !== 1) return reset(false);
      const dx = (e.changedTouches[0]?.clientX ?? st.x) - st.x;
      const fast = Date.now() - st.t < 600;
      const target = dx < 0 ? nav.current.next : nav.current.prev;
      if (target && (Math.abs(dx) > 110 || (fast && Math.abs(dx) > 60))) {
        reset(false);
        nav.current.go(target);
      } else reset(true);
    };
    sc.addEventListener('touchstart', onStart, { passive: true });
    sc.addEventListener('touchmove', onMove, { passive: true });
    sc.addEventListener('touchend', onEnd, { passive: true });
    sc.addEventListener('touchcancel', () => ((s = null), reset(true)), { passive: true });
    return () => {
      sc.removeEventListener('touchstart', onStart);
      sc.removeEventListener('touchmove', onMove);
      sc.removeEventListener('touchend', onEnd);
    };
  }, [index]);
  if (bi < 0) return null;
  return (
    <>
      {prev && (
        <button className="chap-nav prev" onClick={() => go(prev)} aria-label={t('Предыдущая глава: {ref}', { ref: name(prev) })} title={name(prev)}>
          <ChevronLeft size={24} />
        </button>
      )}
      {next && (
        <button className="chap-nav next" onClick={() => go(next)} aria-label={t('Следующая глава: {ref}', { ref: name(next) })} title={name(next)}>
          <ChevronRight size={24} />
        </button>
      )}
    </>
  );
}

// Текст выбранной части стиха — прямо из страницы: от первого до последнего выбранного слова (с запятыми между ними)
function partText(index, part) {
  if (part?.from == null) return '';
  const [b, c, v] = part.key.split('.');
  const verse = document.querySelector(`.pane-slot.${index === 0 ? 'first' : 'second'} .verse[data-b="${b}"][data-c="${c}"][data-v="${v}"]`);
  const a = verse?.querySelector(`.w[data-i="${Math.min(part.from, part.to)}"]`);
  const z = verse?.querySelector(`.w[data-i="${Math.max(part.from, part.to)}"]`);
  if (!a || !z) return '';
  const r = document.createRange();
  r.setStartBefore(a);
  r.setEndAfter(z);
  return r.toString().replace(/\s+/g, ' ').trim();
}

// Часть стиха: нажмите первое и последнее слово — и действия только для этих слов
function PartInline({ index, module, refs, part, setPart, onDone }) {
  const { openSheet, addFavoritePart, toast } = useApp();
  const [text, setText] = useState('');
  useEffect(() => setText(partText(index, part)), [part]);
  const ref = refs[0];
  const ready = part.from != null && text;
  const copy = async () => {
    const s = quoteVerse(text, quoteLabel([ref]));
    try {
      await navigator.clipboard.writeText(s);
      toast(t('Часть стиха скопирована'));
    } catch {
      toast(s);
    }
    onDone();
  };
  return (
    <div className="sel-inline part-inline">
      <p className="part-hint">{ready ? `«${text}»` : t('Нажмите на первое и последнее слово.')}</p>
      <div className="part-btns">
        <button className="btn primary" disabled={!ready} onClick={() => (openSheet('sermon-add', index, { refs: [ref], moduleId: module.id, fragment: { text } }), onDone())}>
          <ScrollText size={17} /> {t('В проповедь')}
        </button>
        {/* «♥ | копировать | ×» — одна кнопка, разделённая вертикальными линиями */}
        <div className="part-group" role="group">
          <button className="part-seg" disabled={!ready} onClick={() => (addFavoritePart(ref, text, Math.min(part.from, part.to), Math.max(part.from, part.to)), onDone())} aria-label={t('В любимые')} title={t('В любимые')}>
            <Heart size={18} />
          </button>
          <button className="part-seg" disabled={!ready} onClick={copy} aria-label={t('Копировать')} title={t('Копировать')}>
            <Copy size={18} />
          </button>
          <button className="part-seg" onClick={() => setPart(null)} aria-label={t('Отмена')} title={t('Отмена')}>
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

// Выделен стих — прямо под ним: главная кнопка «Слушать» (с первого выделенного стиха)
// и «В проповедь» (выбор проповеди или новая, стихи добавляются сами); один стих — ещё «Часть стиха»
function SelectionInline({ index, module, refs, onDone, onPartStart }) {
  const { openSheet } = useApp();
  const first = refs[0];
  return (
    <div className="sel-inline">
      <button
        className="btn primary sel-listen"
        onClick={() => {
          listenFrom(index, module.id, first);
          onDone();
        }}
        aria-label={t('Слушать с этого стиха')}
        title={t('Слушать')}
      >
        <Headphones size={20} />
      </button>
      <button
        className="btn"
        onClick={() => {
          openSheet('sermon-add', index, { refs, moduleId: module.id });
          onDone();
        }}
      >
        <ScrollText size={17} /> {t('В проповедь')}
      </button>
      {refs.length === 1 && (
        <button className="btn" onClick={onPartStart}>
          <TextSelect size={17} /> {t('Часть стиха')}
        </button>
      )}
      <button
        className="btn"
        onClick={() => {
          openSheet('interlinear', index, { ref: first, moduleId: module.id });
          onDone();
        }}
      >
        <WholeWord size={17} /> {t('Подстрочник')}
      </button>
    </div>
  );
}

// Человек ушёл из плана читать дальше — кнопка возврата к плану на день
function PlanReturn({ index, lastPlan }) {
  const { returnToPlan, dismissPlanReturn } = useApp();
  const plan = usePlan(lastPlan.uid);
  if (!plan || plan.done?.[lastPlan.day]) return null;
  const rs = plan.readings[lastPlan.day] || [];
  const done = rs.filter((r) => readingDone(plan, lastPlan.day, r)).length;
  return (
    <div className="plan-return">
      <button className="plan-return-btn" onClick={() => returnToPlan(index)}>
        <CornerUpLeft size={16} /> {t('К плану · {done} из {total}', { done, total: rs.length })}
      </button>
      <button className="plan-return-x" onClick={() => dismissPlanReturn(index)} aria-label={t('Скрыть кнопку возврата к плану')}>
        <X size={15} />
      </button>
    </div>
  );
}

// Полоса прогресса чтения книги под верхней панелью: доля стихов книги до текущего места
function ReadingProgress({ module, index, fallback }) {
  const ref_ = useLivePosition(index, fallback);
  const book = module?.books.find((b) => b.id === ref_.book);
  if (!book) return null;
  const total = book.verses.reduce((a, b) => a + b, 0) || 1;
  const before = book.verses.slice(0, ref_.chapter - 1).reduce((a, b) => a + b, 0);
  const pct = Math.min(100, Math.max(0, ((before + ref_.verse) / total) * 100));
  const label = t('Прочитано книги «{book}»: {pct}%', { book: book.name, pct: Math.round(pct) });
  return (
    <div className="read-progress" role="progressbar" aria-label={label} title={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function BibleReader({ index }) {
  const { panes, bibles, settings, sheet } = useApp();
  const pane = panes[index];
  const [barHidden, setBarHidden] = useState(false);
  const [selection, setSelection] = useState(() => new Set());
  const module = pane ? bibles.find((b) => b.id === pane.moduleId) || bibles[0] : null;

  // Переход в другое место или смена перевода снимает выделение
  useEffect(() => setSelection(new Set()), [pane?.nav, module?.id]);
  // Выбор части стиха: { key: 'Книга.глава.стих', from, to } — номера слов; сбрасывается вместе с выделением
  const [part, setPart] = useState(null);
  useEffect(() => setPart(null), [selection]);
  const onPart = useCallback(
    (i) =>
      setPart((p) => {
        if (!p) return p;
        if (p.from == null || p.done) return { ...p, from: i, to: i, done: false }; // первое слово (или начать заново)
        return { ...p, to: i, done: true }; // последнее слово
      }),
    []
  );

  useEffect(() => {
    if (!selection.size || sheet) return;
    const onKey = (e) => e.key === 'Escape' && setSelection(new Set());
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection.size, sheet]);

  const onSelect = useCallback((ref, mode) => {
    const key = `${ref.book}.${ref.chapter}.${ref.verse}`;
    setSelection((prev) => {
      if (mode === 'start') return new Set([key]);
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setBarHidden(false);
  }, []);

  // Режим чтения: верхняя панель уходит при прокрутке вниз — с ней и нижняя панель вкладок (по первой панели чтения).
  // Пока открыто окно или выделен стих — панели на месте.
  const hidden = !!(pane && pane.kind !== 'map' && settings.focusMode && barHidden && !selection.size);
  useEffect(() => {
    if (index !== 0) return;
    const root = document.documentElement;
    root.classList.toggle('reading-hidden', hidden && !sheet);
    return () => root.classList.remove('reading-hidden');
  }, [index, hidden, !!sheet]);

  if (!pane) return null;
  if (pane.kind === 'map') return <MapPane pane={pane} />;
  // Кнопки под последним выделенным стихом
  const selRefs = selection.size ? sortedRefs(selection) : null;
  const done = () => setSelection(new Set());
  const selActions = selRefs
    ? {
        last: selRefs[selRefs.length - 1],
        node: part ? (
          <PartInline index={index} module={module} refs={selRefs} part={part} setPart={setPart} onDone={done} />
        ) : (
          <SelectionInline index={index} module={module} refs={selRefs} onDone={done} onPartStart={() => setPart({ key: `${selRefs[0].book}.${selRefs[0].chapter}.${selRefs[0].verse}`, from: null, to: null })} />
        ),
      }
    : null;
  return (
    <section className={`reader ${hidden ? 'bar-hidden' : ''}`} aria-label={index === 0 ? t('Основная панель') : t('Вторая панель')}>
      {selection.size ? (
        <SelectionBar index={index} module={module} selection={selection} onDone={() => setSelection(new Set())} />
      ) : (
        <ReaderToolbar index={index} pane={pane} module={module} />
      )}
      {pane.plan ? <PlanProgress uid={pane.plan.uid} day={pane.plan.day} /> : <ReadingProgress module={module} index={index} fallback={pane.ref} />}
      {pane.plan ? (
        <PlanView index={index} pane={pane} module={module} selection={selection} onSelect={onSelect} selActions={selActions} part={part} onPart={onPart} />
      ) : (
        <ChapterView
          index={index}
          pane={pane}
          module={module}
          selection={selection}
          onSelect={onSelect}
          selActions={selActions}
          part={part}
          onPart={onPart}
          onScrollDirection={(down) => settings.focusMode && setBarHidden(down)}
        />
      )}
      {!pane.plan && pane.lastPlan && !selection.size && <PlanReturn index={index} lastPlan={pane.lastPlan} />}
      {!pane.plan && !selection.size && <ChapterNav index={index} module={module} pane={pane} />}
      {!selection.size && <ListenFab index={index} module={module} pane={pane} />}
    </section>
  );
}
