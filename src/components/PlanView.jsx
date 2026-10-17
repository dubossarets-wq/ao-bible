// Страница «план на день»: все отрывки дня одной лентой, по порядку.
// Отметки ставятся сами: отрывок засчитывается, когда его дочитали до конца и провели на нём
// разумное время. В конце каждого отрывка — «Дальше по плану» и «Читать дальше — вне плана».
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Loader2, X, PartyPopper } from 'lucide-react';
import { useApp } from '../App.jsx';
import { getBook } from '../core/modules.js';
import { crossrefCounts } from '../core/crossrefs.js';
import { commentaryIndex } from '../core/commentary.js';
import { illustrationIndex } from '../core/illustrations.js';
import { setLivePosition, clearLivePosition } from '../core/livePosition.js';
import { wordAt, plainText } from '../core/verseMarkup.js';
import { wasClosedOnWord, isDoubleTap, pulseFavorite } from '../core/tapState.js';
import { bookMeta } from '../core/books.js';
import { readingUnits, unitDone, readingDone } from '../core/plans.js';
import { usePlan, markUnits, creditChapter } from '../core/planStore.js';
import { logChapter, minSeconds } from '../core/readLog.js';
import { Chapter, marksFor, selectedIn, afterProps, LONG_PRESS_MS } from './ChapterView.jsx';
import { usePinchFont } from './usePinchFont.js';
import { drawPart, clearPart } from './partShape.js';
import { sermonWith } from '../core/sermons.js';

const STRIP = 50; // высота закреплённой строки плана с запасом

// Подпись отрывка: «Быт 1», «Пс 9:1–21», «Пс 119–120»; full — с полным названием книги
function readingLabel(r, module, full = false) {
  const u = readingUnits(r);
  const b = u[0].book;
  const name = full ? module.books.find((x) => x.id === b)?.name || bookMeta(b).name : bookMeta(b).short.replace(/\.$/, '');
  const [, ch, vs] = r.split('.');
  return vs ? `${name} ${ch}:${vs.replace('-', '–')}` : `${name} ${ch.replace('-', '–')}`;
}

// Что идёт сразу после отрывка в Библии (для «Читать дальше — вне плана»)
function nextAfter(r, module, books) {
  const units = readingUnits(r);
  const u = units[units.length - 1];
  const data = books?.[u.book];
  if (!data) return null;
  const len = (data.chapters[u.chapter - 1] || []).length;
  // Название книги полностью — так понятнее, куда ведёт кнопка
  const full = (id) => module.books.find((b) => b.id === id)?.name || bookMeta(id).name;
  if (u.to && u.to < len) return { ref: { book: u.book, chapter: u.chapter, verse: u.to + 1 }, label: `${full(u.book)} ${u.chapter}:${u.to + 1}` };
  if (u.chapter < data.chapters.length) return { ref: { book: u.book, chapter: u.chapter + 1, verse: 1 }, label: `${full(u.book)} ${u.chapter + 1}` };
  const i = module.books.findIndex((b) => b.id === u.book);
  const nb = i >= 0 ? module.books[i + 1] : null;
  return nb ? { ref: { book: nb.id, chapter: 1, verse: 1 }, label: `${full(nb.id)} 1` } : null;
}

export default function PlanView({ index, pane, module, selection, onSelect, selActions, part, onPart }) {
  const { settings, openSheet, openPopover, closePopover, toggleFavorite, popover, sheet, reportPosition, navigate, marks, toast, modules, exitPlan, settlePlan, openPlanDay } = useApp();
  const { uid, day } = pane.plan;
  const plan = usePlan(uid);
  const readings = plan?.readings[day] || [];
  const scroller = useRef(null);
  usePinchFont(scroller);
  const [books, setBooks] = useState(null); // { id книги: данные }
  const [cur, setCur] = useState(0); // отрывок, который сейчас на экране
  const activeWord = useRef(null);
  const planRef = useRef(plan);
  planRef.current = plan;

  const [counts, setCounts] = useState(null);
  const [comments, setComments] = useState(null);
  const [illus, setIllus] = useState(null);
  useEffect(() => {
    crossrefCounts().then(setCounts);
    commentaryIndex().then((m) => setComments(m.size ? m : null));
  }, [modules]);

  // Загружаем все книги дня
  const bookIds = useMemo(() => [...new Set(readings.flatMap((r) => readingUnits(r).map((u) => u.book)))], [readings.join()]);
  useEffect(() => {
    let alive = true;
    setBooks(null);
    clearLivePosition(index);
    // Счётчики параллельных мест и комментарии — вместе с текстом, чтобы высота стихов не менялась после прокрутки к месту
    Promise.all([
      Promise.all(bookIds.map((b) => (module.books.some((x) => x.id === b) ? getBook(module.id, b) : null))),
      crossrefCounts().then(setCounts),
      commentaryIndex().then((m) => setComments(m.size ? m : null)),
      illustrationIndex().then((m) => setIllus(m.size ? m : null)),
    ]).then(([list]) => {
      if (alive) setBooks(Object.fromEntries(bookIds.map((b, i) => [b, list[i]])));
    });
    return () => {
      alive = false;
    };
  }, [module.id, bookIds.join(), pane.nav]);

  // Куда прокрутить: только что открытый день или «Вернуться к плану» — к нужному отрывку или стиху,
  // иначе (перезапуск приложения, смена перевода) — к последнему месту чтения
  useLayoutEffect(() => {
    positions.current = null;
    const el = scroller.current;
    if (!el || !books) return;
    const verseEl = (r) => r && el.querySelector(`.verse[data-b="${r.book}"][data-c="${r.chapter}"][data-v="${r.verse}"]`);
    const { at, ref } = pane.plan;
    const target = at != null ? (at > 0 ? el.querySelector(`[data-r="${at}"]`) : null) : verseEl(ref || pane.ref);
    el.scrollTop = target ? yOf(target) - STRIP + (at != null ? 0 : 8) : 0;
    // Дальше (и после перезапуска) открываемся на последнем месте чтения
    if (at != null || ref) settlePlan(index);
  }, [books]);

  // Координата элемента в прокрутке (над текстом — закреплённая строка плана)
  const yOf = (node) => node.offsetTop + (scroller.current?.querySelector('.text-col')?.offsetTop || 0);

  // Текущий стих для верхней панели и сохранения места
  const positions = useRef(null);
  const frame = useRef(0);
  const posTimer = useRef(null);
  const trackPosition = () => {
    frame.current = 0;
    const el = scroller.current;
    if (!el) return;
    if (!positions.current)
      positions.current = Array.from(el.querySelectorAll('.verse'), (v) => ({
        bottom: yOf(v) + v.offsetHeight,
        ref: { book: v.dataset.b, chapter: +v.dataset.c, verse: +v.dataset.v },
        r: +v.closest('[data-r]').dataset.r,
      }));
    const list = positions.current;
    if (!list.length) return;
    const top = el.scrollTop + STRIP;
    let lo = 0;
    let hi = list.length - 1;
    let found = list[0];
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].bottom > top) {
        found = list[mid];
        hi = mid - 1;
      } else lo = mid + 1;
    }
    setLivePosition(index, found.ref);
    setCur(found.r);
    clearTimeout(posTimer.current);
    posTimer.current = setTimeout(() => reportPosition(index, found.ref), 450);
  };
  useEffect(() => {
    const col = scroller.current?.querySelector('.text-col');
    if (!col) return;
    const ro = new ResizeObserver(() => (positions.current = null));
    ro.observe(col);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [books, settings]);

  // Автоотметки: раз в секунду добавляем время каждому видимому отрывку и смотрим, дочитан ли он до конца
  const track = useRef(new Map());
  useEffect(() => {
    if (!books || !plan) return;
    track.current = new Map();
    const timer = setInterval(() => {
      const el = scroller.current;
      const p = planRef.current;
      if (!el || !p || document.visibilityState !== 'visible' || document.querySelector('.sheet')) return;
      const top = el.scrollTop + STRIP;
      const bottom = el.scrollTop + el.clientHeight;
      const hits = [];
      el.querySelectorAll('.plan-unit').forEach((u) => {
        const key = u.dataset.u;
        if (unitDone(p, day, key)) return;
        const uTop = yOf(u);
        if (uTop + u.offsetHeight < top || uTop > bottom) return;
        const d = track.current.get(key) || { t: 0, end: false };
        track.current.set(key, d);
        d.t += 1;
        const vs = u.querySelectorAll('.verse');
        const last = vs[vs.length - 1];
        if (last && yOf(last) + last.offsetHeight <= bottom + 4) d.end = true;
        if (d.end && d.t >= minSeconds(vs.length)) hits.push(u);
      });
      if (!hits.length) return;
      hits.filter((u) => u.dataset.whole).forEach((u) => (logChapter(u.dataset.b, +u.dataset.c), creditChapter(u.dataset.b, +u.dataset.c)));
      const finished = markUnits(uid, day, hits.map((u) => u.dataset.u));
      if (finished) toast('План на сегодня выполнен 🎉');
      else {
        const np = planRef.current;
        const r = readings.find((x) => readingUnits(x).some((u) => u.key === hits[0].dataset.u));
        if (r && readingDone(np, day, r)) toast(`✓ Прочитано: ${readingLabel(r, module)}`);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [books, uid, day]);

  // Текущий отрывок в строке плана всегда виден
  useEffect(() => {
    const chip = scroller.current?.querySelector('.plan-strip-chips .chip.on');
    const row = chip?.parentElement;
    if (chip && row) row.scrollTo({ left: chip.offsetLeft - row.offsetLeft - row.clientWidth / 2 + chip.offsetWidth / 2, behavior: 'smooth' });
  }, [cur, books]);

  // Любое касание мимо выделенного слова (другой стих, другое слово, панель, пустое место) только снимает
  // выделение: это касание больше ничего не делает — новое слово не выделяется, выборка не открывается.
  // Выборка словарей и открытая статья — не «мимо»: там выделение показывает, о каком слове речь.
  const swallowTap = useRef(false);
  useEffect(() => {
    const onDown = (e) => {
      const w = activeWord.current;
      swallowTap.current = false;
      if (!w || w.contains(e.target) || e.target.closest?.('.word-pop, .sheet, .tour')) return;
      w.classList.remove('active');
      activeWord.current = null;
      swallowTap.current = true;
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, []);

  // Слова выбранной части стиха и любимых частей — отмечаем классами прямо в тексте
  const { favParts } = useApp();
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.querySelectorAll('.w.fav-part').forEach((w) => w.classList.remove('fav-part'));
    clearPart(el); // прежняя подложка выбранной части
    const mark = (b, c, v, from, to, cls) =>
      el.querySelectorAll(`.verse[data-b="${b}"][data-c="${c}"][data-v="${v}"] .w`).forEach((w) => +w.dataset.i >= from && +w.dataset.i <= to && w.classList.add(cls));
    for (const [k, verses] of favParts) {
      const [b, c] = k.split('.');
      for (const [v, [from, to]] of Object.entries(verses)) mark(b, c, v, from, to, 'fav-part');
    }
    if (part?.from != null) {
      drawPart(el, part); // выбранная часть — одной цельной плашкой под текстом
    }
  });

  // Снимаем подсветку слова, когда закрыты и выборка словарей, и окно статьи
  useEffect(() => {
    if (!sheet && !popover && activeWord.current) {
      activeWord.current.classList.remove('active');
      activeWord.current = null;
    }
  }, [sheet, popover]);

  const scrollToReading = (i) => {
    const el = scroller.current;
    const t = el?.querySelector(`[data-r="${i}"]`);
    if (t) el.scrollTo({ top: i === 0 ? 0 : yOf(t) - STRIP, behavior: settings.animations ? 'smooth' : 'auto' });
  };
  const markReading = (r) => {
    readingUnits(r)
      .filter((u) => u.to == null)
      .forEach((u) => logChapter(u.book, u.chapter));
    if (markUnits(uid, day, readingUnits(r).map((u) => u.key))) toast('План на сегодня выполнен 🎉');
  };

  // Нажатия: слова, номера стихов, параллельные места, заметки, комментарии; долгое нажатие — выделение
  const press = useRef(null);
  const suppressClick = useRef(false);
  const verseRefOf = (el) => {
    const v = el?.closest?.('.verse');
    return v ? { book: v.dataset.b, chapter: +v.dataset.c, verse: +v.dataset.v } : null;
  };
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  const onPointerDown = (e) => {
    suppressClick.current = false;
    if (e.button > 0) return;
    const vref = verseRefOf(e.target);
    if (!vref || e.target.closest('[data-act]')) return;
    cancelPress();
    press.current = {
      x: e.clientX,
      y: e.clientY,
      timer: setTimeout(() => {
        press.current = null;
        suppressClick.current = true;
        navigator.vibrate?.(12);
        window.getSelection?.()?.removeAllRanges();
        onSelect?.(vref, selection?.size ? 'toggle' : 'start');
      }, LONG_PRESS_MS),
    };
  };
  const onPointerMove = (e) => {
    if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 10) cancelPress();
  };
  const onContextMenu = (e) => {
    const vref = verseRefOf(e.target);
    if (!vref) return;
    e.preventDefault();
    if (press.current || e.nativeEvent?.pointerType === 'touch') return;
    if (!suppressClick.current) onSelect?.(vref, selection?.size ? 'toggle' : 'start');
  };
  const onClick = (e) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (swallowTap.current) {
      swallowTap.current = false;
      return;
    }
    const vref = verseRefOf(e.target);
    if (!vref || !books?.[vref.book]) return;
    // Выбор части стиха: нажатия по словам этого стиха задают начало и конец
    if (part && `${vref.book}.${vref.chapter}.${vref.verse}` === part.key) {
      const w = e.target.closest('.w');
      if (w) onPart?.(+w.dataset.i);
      return;
    }
    if (selection?.size) return onSelect?.(vref, 'toggle');
    const text = books[vref.book].chapters[vref.chapter - 1][vref.verse - 1];
    const act = e.target.closest('[data-act]')?.dataset.act;
    // Двойное нажатие на стих — в любимые (повторное — убрать)
    if (!act && isDoubleTap(`${vref.book}.${vref.chapter}.${vref.verse}`)) {
      closePopover();
      activeWord.current?.classList.remove('active');
      activeWord.current = null;
      toggleFavorite(vref, plainText(text));
      return pulseFavorite(e.target.closest('.verse'));
    }
    if (act === 'xref') return openSheet('xrefs', index, { ref: vref, moduleId: module.id });
    if (act === 'note') return openSheet('note', index, { refs: [vref], moduleId: module.id });
    if (act === 'sermon') return openSheet('sermons', index, { open: sermonWith(vref)?.id || null });
    if (act === 'comment') return openSheet('commentary', index, { ref: vref, moduleId: e.target.closest('[data-m]').dataset.m });
    if (act === 'illus') return openSheet('illus', index, { ref: vref, items: illus?.get(`${vref.book}.${vref.chapter}.${vref.verse}`) || [] });
    if (act === 'verse') return openSheet('verse', index, { ref: vref, text: plainText(text), moduleId: module.id });
    const sn = e.target.closest('.sn');
    if (sn) {
      const token = wordAt(text, +sn.dataset.i);
      if (!token?.strongs) return;
      closePopover();
      return openSheet('dict', index, { token: { text: token.text, strongs: token.strongs, morph: token.morph || null }, ref: vref, moduleId: module.id, verseText: plainText(text), initial: 'full' });
    }
    const w = e.target.closest('.w');
    if (!w) return;
    if (wasClosedOnWord(w) || (w === activeWord.current && !popover && !sheet)) {
      w.classList.remove('active');
      activeWord.current = null;
      return;
    }
    const token = wordAt(text, +w.dataset.i);
    if (!token) return;
    activeWord.current?.classList.remove('active');
    w.classList.add('active');
    activeWord.current = w;
    const tok = { text: token.text, strongs: token.strongs || null, morph: token.morph || null };
    const r = w.getBoundingClientRect();
    openPopover({
      pane: index,
      token: tok,
      ref: vref,
      rect: { left: r.left, top: r.top, bottom: r.bottom, width: r.width },
      payload: { token: tok, ref: vref, moduleId: module.id, verseText: plainText(text) },
    });
  };

  const opts = useMemo(
    () => ({
      showVerseNumbers: settings.showVerseNumbers && !settings.bookMode,
      showStrongs: settings.showStrongs && module.features?.strongs && !settings.bookMode,
      showHeadings: settings.showHeadings,
      showXref: settings.showXrefButtons && !settings.focusMode && !settings.bookMode,
      inlineComments: settings.bookMode ? [] : settings.inlineCommentaries,
      continuous: settings.continuousVerses || settings.bookMode,
      showIllus: settings.showIllustrations !== false && !settings.bookMode,
    }),
    [settings.showVerseNumbers, settings.showStrongs, settings.showHeadings, settings.showXrefButtons, settings.focusMode, settings.continuousVerses, settings.inlineCommentaries, settings.bookMode, settings.showIllustrations, module]
  );

  if (!plan || !readings.length)
    return (
      <div className="scroller">
        <div className="text-col">
          <div className="notice">
            Этот план удалён или в нём нет такого дня.{' '}
            <button className="btn small" onClick={() => exitPlan(index)}>
              Обычное чтение
            </button>
          </div>
        </div>
      </div>
    );

  const n = readings.length;
  const doneFlags = readings.map((r) => readingDone(plan, day, r));
  const doneCount = doneFlags.filter(Boolean).length;
  const allDone = doneCount === n;
  const firstLeft = doneFlags.findIndex((d) => !d);

  return (
    <div
      className={`scroller plan-view${selection?.size ? ' selecting' : ''}`}
      ref={scroller}
      onScroll={() => {
        cancelPress();
        if (!frame.current) frame.current = requestAnimationFrame(trackPosition);
      }}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onContextMenu={onContextMenu}
    >
      <div className="plan-strip" role="navigation" aria-label="Отрывки плана на день">
        <span className="plan-strip-day">
          День {day + 1} · {doneCount}/{n}
        </span>
        <div className="plan-strip-chips">
          {readings.map((r, i) => (
            <button key={r + i} className={`chip ${doneFlags[i] ? 'done' : ''} ${cur === i ? 'on' : ''}`} onClick={() => scrollToReading(i)} aria-current={cur === i ? 'true' : undefined}>
              {doneFlags[i] && <Check size={12} />} {readingLabel(r, module)}
            </button>
          ))}
        </div>
        <button className="icon-btn subtle" onClick={() => exitPlan(index)} aria-label="Выйти из плана" title="Выйти из плана">
          <X size={17} />
        </button>
      </div>

      <div className={`text-col${settings.bookMode ? ' book-mode' : ''}`} dir={module.language === 'he' ? 'rtl' : undefined} lang={module.language || undefined}>
        <div className="plan-intro">
          <div className="plan-intro-name">{plan.name}</div>
          <div className="plan-intro-meta">
            День {day + 1} из {plan.readings.length} · {n} {n === 1 ? 'отрывок' : n < 5 ? 'отрывка' : 'отрывков'}
          </div>
          <p className="plan-intro-hint">Читайте подряд сверху вниз. Отрывок отметится сам, когда вы дочитаете его до конца.</p>
        </div>
        {!books && (
          <div className="loading">
            <Loader2 className="spin" size={22} /> Загрузка…
          </div>
        )}
        {books &&
          readings.map((r, i) => {
            const units = readingUnits(r);
            // Следующая глава и так в плане этого дня — кнопку «вне плана» не показываем
            const nx = nextAfter(r, module, books);
            const inPlan = nx && readings.some((x) => readingUnits(x).some((u) => u.book === nx.ref.book && u.chapter === nx.ref.chapter && u.from === nx.ref.verse));
            const next = inPlan ? null : nx;
            return (
              <section key={r + i} className={`plan-seg${doneFlags[i] ? ' is-done' : ''}`} data-r={i}>
                <header className="plan-seg-head">
                  <span className="plan-seg-n">
                    Чтение {i + 1} из {n}
                  </span>
                  <span className="plan-seg-label">{readingLabel(r, module, true)}</span>
                  {doneFlags[i] && (
                    <span className="plan-seg-ok">
                      <Check size={14} /> Прочитано
                    </span>
                  )}
                </header>
                {units.map((u, k) => {
                  const data = books[u.book];
                  if (!data)
                    return (
                      <div key={k} className="notice">
                        В переводе {module.name} нет книги «{bookMeta(u.book).name}». Выберите другой перевод вверху.
                      </div>
                    );
                  const verses = data.chapters[u.chapter - 1];
                  if (!verses) return null;
                  return (
                    <div key={k} className="plan-unit" data-u={u.key} data-b={u.book} data-c={u.chapter} data-whole={u.to == null ? '1' : undefined}>
                      <Chapter
                        bookId={u.book}
                        bookName={data.name || bookMeta(u.book).name}
                        c={u.chapter}
                        verses={verses}
                        headings={data.headings}
                        xrefs={data.xrefs}
                        counts={counts}
                        comments={comments}
                        illus={illus}
                        opts={opts}
                        hlRe={null}
                        isPsalm={u.book === 'Ps'}
                        flashVerse={null}
                        marks={marksFor(marks, u.book, u.chapter)}
                        selected={selectedIn(selection, u.book, u.chapter)}
                        from={u.from}
                        to={u.to}
                        idp={`p${i}-${k}-`}
                        noBookTitle
                        noChapterTitle={units.length === 1}
                        {...afterProps(selActions, u.book, u.chapter, u.from, u.to)}
                      />
                    </div>
                  );
                })}
                <div className="plan-seg-end">
                  {doneFlags[i] ? (
                    <div className="plan-ok">
                      <Check size={16} /> {readingLabel(r, module)} — прочитано
                    </div>
                  ) : (
                    <button className="btn small subtle plan-mark" onClick={() => markReading(r)}>
                      <Check size={14} /> Отметить прочитанным
                    </button>
                  )}
                  {i < n - 1 ? (
                    <button className="btn primary plan-next" onClick={() => scrollToReading(i + 1)}>
                      Дальше по плану: {readingLabel(readings[i + 1], module)} <ChevronDown size={17} />
                    </button>
                  ) : allDone ? (
                    <div className="plan-finish">
                      <div className="plan-finish-row">
                        <PartyPopper size={22} />
                        <strong>План на сегодня выполнен</strong>
                        <button className="btn primary" onClick={() => exitPlan(index)}>
                          Готово
                        </button>
                      </div>
                      {day < plan.readings.length - 1 && (
                        <button className="btn plan-next-day" onClick={() => openPlanDay(index, uid, day + 1)}>
                          Читать день {day + 2} <ChevronRight size={16} />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="plan-left">
                      <span>Осталось прочитать:</span>
                      {readings.map((x, j) =>
                        doneFlags[j] ? null : (
                          <button key={x + j} className="chip" onClick={() => scrollToReading(j)}>
                            {readingLabel(x, module)}
                          </button>
                        )
                      )}
                    </div>
                  )}
                  {next && (
                    <button
                      className="plan-offplan"
                      onClick={() => navigate(index, next.ref, { flash: false, planReturn: { at: i < n - 1 ? i + 1 : firstLeft >= 0 ? firstLeft : i, ref: null } })}
                    >
                      <span className="plan-offplan-main">
                        Читать дальше: {next.label} <ChevronRight size={15} />
                      </span>
                      <span className="plan-offplan-sub">не входит в план</span>
                    </button>
                  )}
                </div>
              </section>
            );
          })}
      </div>
    </div>
  );
}
