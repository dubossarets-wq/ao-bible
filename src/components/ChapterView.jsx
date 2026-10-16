// Текст Библии: непрерывная прокрутка глав внутри книги (главы подгружаются сверху и снизу),
// нажатие на слово открывает словари, кнопка в конце стиха — параллельные места.
// Слова рендерятся HTML-строкой с делегированием событий: в главе может быть больше тысячи слов.
import React, { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, ChevronLeft, Loader2 } from 'lucide-react';
import { useApp } from '../App.jsx';
import { getBook } from '../core/modules.js';
import { crossrefCounts } from '../core/crossrefs.js';
import { commentaryIndex } from '../core/commentary.js';
import { illustrationIndex } from '../core/illustrations.js';
import { setLivePosition, clearLivePosition } from '../core/livePosition.js';
import { setDriver, isDriver, onSync, emitSync } from '../core/scrollSync.js';
import { useAudio } from '../core/audio.js';
import { verseHtml, wordAt, plainText } from '../core/verseMarkup.js';
import { wasClosedOnWord, isDoubleTap, pulseFavorite } from '../core/tapState.js';
import { logChapter, minSeconds } from '../core/readLog.js';
import { creditChapter } from '../core/planStore.js';
import { sermonWith } from '../core/sermons.js';
import { formatRef } from '../core/books.js';
import { usePinchFont } from './usePinchFont.js';
import { drawPart, clearPart } from './partShape.js';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function highlightRegex(query) {
  if (!query) return null;
  const words = query
    .toLowerCase()
    .split(/[\s\p{P}]+/u)
    .filter((w) => w.length > 1)
    .map((w) => escapeRe(w).replace(/[её]/g, '[её]'));
  return words.length ? new RegExp(words.join('|'), 'iu') : null;
}

// from/to — показать только часть главы (отрывок плана), idp — приставка к id стихов (на странице плана
// одна и та же глава может встретиться дважды), noBookTitle/noChapterTitle — без заголовков (их заменяет заголовок отрывка)
export const Chapter = memo(function Chapter({ bookId, bookName, c, verses, headings, xrefs, counts, comments, illus, opts, hlRe, flashVerse, isPsalm, selected, marks, from = 1, to = null, idp = '', noBookTitle = false, noChapterTitle = false, afterVerse = null, afterNode = null }) {
  const sel = selected ? new Set(selected.split(',').map(Number)) : null;
  const mk = marks ? Object.fromEntries(marks.split(',').map((x) => x.split(':'))) : {};
  return (
    <div className="chapter" data-c={c}>
      {c === 1 && !noBookTitle && <h1 className="book-title">{bookName}</h1>}
      {!noChapterTitle && <h2 className="chapter-title">{isPsalm ? `Псалом ${c}` : `Глава ${c}`}</h2>}
      <div className={`verses ${opts.continuous ? 'continuous' : ''}`}>
        {verses.map((text, i) => {
          const v = i + 1;
          if (!text || v < from || (to && v > to)) return null;
          const heading = opts.showHeadings && headings?.[`${c}:${v}`];
          const n = (counts?.get(`${bookId}.${c}.${v}`) || 0) + (xrefs?.[`${c}:${v}`]?.length || 0);
          return (
            <React.Fragment key={v}>
              {heading && <h3 className="section-title">{heading}</h3>}
              <p
                className={`verse${flashVerse === v ? ' flash' : ''}${sel?.has(v) ? ' selected' : ''}${mk[v]?.includes('f') ? ' fav' : ''}${/[1-6]/.test(mk[v] || '') ? ` hl-${mk[v].match(/[1-6]/)[0]}` : ''}`}
                data-b={bookId}
                data-c={c}
                data-v={v}
                id={`${idp}v-${c}-${v}`}
                aria-selected={sel ? sel.has(v) : undefined}
              >
                {opts.showVerseNumbers && (
                  <button className="vn" data-act="verse" aria-label={`Стих ${v}: действия`}>
                    {v}
                  </button>
                )}
                {mk[v]?.includes('b') && <span className="vmark bm" title="Закладка" aria-label="Закладка" />}
                {mk[v]?.includes('s') && (
                  <button className="vmark sermon-mark" data-act="sermon" title="Есть в проповеди — открыть" aria-label="Стих есть в проповеди. Открыть проповедь">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M15 12h-5" />
                      <path d="M15 8h-5" />
                      <path d="M19 17V5a2 2 0 0 0-2-2H4" />
                      <path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3" />
                    </svg>
                  </button>
                )}
                {/[fp]/.test(mk[v] || '') && (
                  <span className={`vmark fav-heart${mk[v].includes('p') ? ' part' : ''}`} title={mk[v].includes('p') ? 'Любимая часть стиха' : 'Любимый стих'} aria-label={mk[v].includes('p') ? 'Любимая часть стиха' : 'Любимый стих'}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 21s-7.6-4.7-9.7-9.4C.8 8.3 3 4.4 6.8 4.4c2.2 0 3.7 1.2 5.2 3 1.5-1.8 3-3 5.2-3 3.8 0 6 3.9 4.5 7.2C19.6 16.3 12 21 12 21z" fill="currentColor" />
                    </svg>
                  </span>
                )}
                <span className="vt" dangerouslySetInnerHTML={{ __html: verseHtml(text, { showStrongs: opts.showStrongs, highlight: hlRe }) }} />
                {mk[v]?.includes('n') && (
                  <button className="note-tag" data-act="note" aria-label="Заметка к стиху" title="Заметка">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                )}
                {opts.showXref && n > 0 && (
                  <button className="xr" data-act="xref" aria-label={`Параллельные места: ${n}`}>
                    [⇅&nbsp;{n}]
                  </button>
                )}
                {opts.showIllus && illus?.has(`${bookId}.${c}.${v}`) && (
                  <button className="il" data-act="illus" aria-label="Иллюстрация к стиху" title="Иллюстрация">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="9" cy="9" r="2" />
                      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
                    </svg>
                    {illus.get(`${bookId}.${c}.${v}`).length > 1 && <span>2</span>}
                  </button>
                )}
                {comments
                  ?.get(`${bookId}.${c}.${v}`)
                  ?.filter((cm) => !opts.inlineComments || opts.inlineComments.includes(cm.id))
                  .map((cm) => (
                    <button key={cm.id} className="cm" data-act="comment" data-m={cm.id} aria-label={`Комментарий: ${cm.name}`}>
                      {cm.name}
                    </button>
                  ))}
              </p>
              {afterVerse === v && afterNode}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
});

export const LONG_PRESS_MS = 450;

// Отметки главы строкой «5:fb,7:n» — примитив для memo
export function marksFor(marks, bookId, c) {
  const row = marks?.get(`${bookId}.${c}`);
  return row ? Object.entries(row).map(([v, f]) => `${v}:${f}`).join(',') : null;
}

// Кнопки под последним выделенным стихом — только в его главе (остальные главы не перерисовываются)
export const afterProps = (sa, bookId, c, from = 1, to = null) =>
  sa && sa.last.book === bookId && sa.last.chapter === c && sa.last.verse >= from && (!to || sa.last.verse <= to) ? { afterVerse: sa.last.verse, afterNode: sa.node } : null;

// Строка номеров выделенных стихов главы («5,6») — примитив, чтобы memo главы не сбрасывался зря
export function selectedIn(selection, bookId, c) {
  if (!selection?.size) return null;
  const prefix = `${bookId}.${c}.`;
  const out = [];
  for (const k of selection) if (k.startsWith(prefix)) out.push(k.slice(prefix.length));
  return out.length ? out.join(',') : null;
}

// selection — Set ключей «Книга.глава.стих»; onSelect(ref, 'start' | 'toggle') — выделение стихов
export default function ChapterView({ index, pane, module, onScrollDirection, selection, onSelect, selActions, part, onPart }) {
  const { settings, openSheet, openPopover, closePopover, popover, reportPosition, navigate, sheet, modules, marks, toast, toggleFavorite } = useApp();
  const scroller = useRef(null);
  usePinchFont(scroller);
  const [book, setBook] = useState(null); // { id, data, meta }
  const [range, setRange] = useState(null);
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState(null);
  const pending = useRef(null);
  const lastY = useRef(0);
  const posTimer = useRef(null);
  const activeWord = useRef(null);
  const ref = pane.ref;

  // Счётчики параллельных мест (пересчитываются при включении/выключении модулей)
  const [comments, setComments] = useState(null);
  const [illus, setIllus] = useState(null);
  useEffect(() => {
    crossrefCounts().then(setCounts);
    commentaryIndex().then((m) => setComments(m.size ? m : null));
    illustrationIndex().then((m) => setIllus(m.size ? m : null));
  }, [modules]);

  // Навигация: загрузить книгу и прокрутить к стиху
  useEffect(() => {
    let alive = true;
    setError(null);
    const meta = module.books.find((b) => b.id === ref.book);
    if (!meta) {
      setError(`В переводе ${module.name} нет книги «${ref.book}».`);
      return;
    }
    clearLivePosition(index);
    getBook(module.id, ref.book).then((data) => {
      if (!alive) return;
      if (!data) return setError('Не удалось прочитать книгу из хранилища. Попробуйте переустановить модуль в библиотеке.');
      const total = data.chapters.length;
      const c = Math.min(Math.max(1, ref.chapter), total);
      pending.current = { type: 'nav', c, v: ref.verse };
      setBook({ id: ref.book, data, meta });
      setRange({ start: Math.max(1, c - 1), end: Math.min(total, c + 1) });
    }).catch(() => alive && setError('Не удалось прочитать книгу из памяти телефона. Закройте приложение и откройте снова.'));
    return () => {
      alive = false;
    };
  }, [module.id, pane.nav]);

  useLayoutEffect(() => {
    // Текст сменился (переход, подгрузка глав) — старые координаты стихов недействительны.
    // Сбрасываем сразу, до первой прокрутки: иначе место в шапке и в истории бралось бы из прежней книги.
    positions.current = null;
    const el = scroller.current;
    const p = pending.current;
    if (!el || !p || !range) return;
    pending.current = null;
    if (p.type === 'nav') {
      const target = p.v > 1 ? el.querySelector(`#v-${p.c}-${p.v}`) : el.querySelector(`.chapter[data-c="${p.c}"]`);
      el.scrollTop = target ? target.offsetTop - 8 : 0;
      lastY.current = el.scrollTop;
    } else if (p.type === 'prepend') {
      el.scrollTop = p.top + (el.scrollHeight - p.height);
      lastY.current = el.scrollTop;
    }
  }, [range, book]);

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

  const total = book?.data.chapters.length || 0;

  const onScroll = () => {
    const el = scroller.current;
    if (!el || !range) return;
    const y = el.scrollTop;
    if (Math.abs(y - lastY.current) > 24) {
      onScrollDirection?.(y > lastY.current && y > 80);
      lastY.current = y;
    }
    if (y < 900 && range.start > 1 && !pending.current) {
      pending.current = { type: 'prepend', top: y, height: el.scrollHeight };
      setRange((r) => ({ ...r, start: r.start - 1 }));
    } else if (el.scrollHeight - y - el.clientHeight < 1400 && range.end < total && !pending.current) {
      setRange((r) => ({ ...r, end: r.end + 1 }));
    }
    // Текущий стих — раз в кадр, по закэшированным координатам (без перерисовки всего приложения)
    if (!frame.current) frame.current = requestAnimationFrame(trackPosition);
  };

  // Координаты низа каждого стиха; кэш сбрасывается, когда меняется высота текста (подгрузка глав, шрифт)
  const positions = useRef(null);
  const frame = useRef(0);
  const measure = () => {
    const els = scroller.current?.querySelectorAll('.verse') || [];
    positions.current = Array.from(els, (v) => ({ top: v.offsetTop, bottom: v.offsetTop + v.offsetHeight, c: +v.dataset.c, v: +v.dataset.v }));
  };
  const trackPosition = () => {
    frame.current = 0;
    const el = scroller.current;
    if (!el || !book) return;
    if (!positions.current) measure();
    const list = positions.current;
    if (!list.length) return;
    const top = el.scrollTop + 12;
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
    const ref = { book: book.id, chapter: found.c, verse: found.v };
    setLivePosition(index, ref);
    // Синхронная прокрутка: ведущая панель передаёт стих и долю его высоты
    if (settings.syncScroll && isDriver(index)) {
      const frac = Math.max(0, Math.min(1, (top - found.top) / Math.max(1, found.bottom - found.top)));
      emitSync(index, { ref, frac });
    }
    // В историю и сохранение — когда прокрутка стихла
    clearTimeout(posTimer.current);
    posTimer.current = setTimeout(() => reportPosition(index, ref), 450);
  };
  useEffect(() => {
    positions.current = null;
    const col = scroller.current?.firstElementChild;
    if (!col) return;
    const ro = new ResizeObserver(() => {
      positions.current = null;
    });
    ro.observe(col);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [range, book, settings]);

  // Учёт прочитанного: сколько секунд каждая глава была на экране и дошёл ли человек до её конца.
  // Дочитанная глава записывается в историю чтения и засчитывается в планы чтения.
  const dwell = useRef(new Map()); // «Книга.глава» -> { t, end, done }
  useEffect(() => {
    if (!book) return;
    const timer = setInterval(() => {
      const el = scroller.current;
      if (!el || document.visibilityState !== 'visible' || document.querySelector('.sheet')) return;
      const top = el.scrollTop;
      const bottom = top + el.clientHeight;
      for (const ch of el.querySelectorAll('.chapter')) {
        const cTop = ch.offsetTop;
        if (cTop + ch.offsetHeight < top || cTop > bottom) continue;
        const key = `${book.id}.${ch.dataset.c}`;
        const d = dwell.current.get(key) || { t: 0, end: false, done: false };
        dwell.current.set(key, d);
        if (d.done) continue;
        d.t += 1;
        const vs = ch.querySelectorAll('.verse');
        const last = vs[vs.length - 1];
        if (last && last.offsetTop + last.offsetHeight <= bottom + 4) d.end = true;
        if (!d.end || d.t < minSeconds(vs.length)) continue;
        d.done = true;
        const c = +ch.dataset.c;
        logChapter(book.id, c);
        const { credited, finished } = creditChapter(book.id, c);
        if (finished.length) toast(`План «${finished[0]}»: чтение на сегодня выполнено ✓`);
        else if (credited.length) toast(`Засчитано в план «${credited[0]}»: ${formatRef({ book: book.id, chapter: c, verse: 1 }).replace(/:1$/, '')}`);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [book]);

  // Долгое нажатие на стих (палец или мышь) — выделение стиха и панель действий сверху.
  // Сдвиг пальца больше 10 px (прокрутка) отменяет нажатие.
  const press = useRef(null);
  const suppressClick = useRef(false);
  const verseRefOf = (el) => {
    const verseEl = el?.closest?.('.verse');
    return verseEl && book ? { book: book.id, chapter: +verseEl.dataset.c, verse: +verseEl.dataset.v } : null;
  };
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  const onPointerDown = (e) => {
    userTouchAt.current = Date.now();
    // Новое касание — новый жест: после долгого нажатия телефон может не прислать щелчок,
    // и без этого следующее обычное нажатие (снять выделение) проглатывалось
    suppressClick.current = false;
    setDriver(index);
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
    // Правая кнопка мыши на компьютере работает как долгое нажатие; на телефоне глушим системное меню
    const vref = verseRefOf(e.target);
    if (!vref) return;
    e.preventDefault();
    if (press.current || e.pointerType === 'touch' || e.nativeEvent?.pointerType === 'touch') return;
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
    const verseEl = e.target.closest('.verse');
    if (!verseEl || !book) return;
    const c = +verseEl.dataset.c;
    const v = +verseEl.dataset.v;
    const vref = { book: book.id, chapter: c, verse: v };
    // В режиме выделения нажатие на стих добавляет или убирает его из выделения
    // Выбор части стиха: нажатия по словам этого стиха задают начало и конец
    if (part && `${vref.book}.${vref.chapter}.${vref.verse}` === part.key) {
      const w = e.target.closest('.w');
      if (w) onPart?.(+w.dataset.i);
      return;
    }
    if (selection?.size) return onSelect?.(vref, 'toggle');
    const text = book.data.chapters[c - 1][v - 1];
    const act = e.target.closest('[data-act]')?.dataset.act;
    // Двойное нажатие на стих — в любимые (повторное — убрать)
    if (!act && isDoubleTap(`${book.id}.${c}.${v}`)) {
      closePopover();
      activeWord.current?.classList.remove('active');
      activeWord.current = null;
      toggleFavorite(vref, plainText(text));
      return pulseFavorite(verseEl);
    }
    if (act === 'xref') return openSheet('xrefs', index, { ref: vref, moduleId: module.id });
    if (act === 'note') return openSheet('note', index, { refs: [vref], moduleId: module.id });
    if (act === 'sermon') return openSheet('sermons', index, { open: sermonWith(vref)?.id || null });
    if (act === 'comment') return openSheet('commentary', index, { ref: vref, moduleId: e.target.closest('[data-m]').dataset.m });
    if (act === 'illus') return openSheet('illus', index, { ref: vref, items: illus?.get(`${vref.book}.${vref.chapter}.${vref.verse}`) || [] });
    if (act === 'verse') return openSheet('verse', index, { ref: vref, text: plainText(text), moduleId: module.id });
    const w = e.target.closest('.w');
    if (w) {
      // Повторное нажатие на выделенное слово — снимаем выделение, выборку не открываем
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
    }
  };

  // Ведомая панель: встаём на стих ведущей. Если стих не загружен или книга другая — переходим туда.
  const syncNav = useRef(null);
  useEffect(
    () =>
      onSync(index, ({ ref, frac }) => {
        const el = scroller.current;
        if (!settings.syncScroll || !el || isDriver(index) || !book) return;
        if (!module.books.some((b) => b.id === ref.book)) return;
        const target = book.id === ref.book ? el.querySelector(`#v-${ref.chapter}-${ref.verse}`) : null;
        if (target) {
          el.scrollTop = target.offsetTop + frac * target.offsetHeight - 12;
          lastY.current = el.scrollTop;
          return;
        }
        const key = `${ref.book}.${ref.chapter}`;
        if (syncNav.current === key) return;
        syncNav.current = key;
        navigate(index, ref, { push: false, flash: false });
        setTimeout(() => syncNav.current === key && (syncNav.current = null), 800);
      }),
    [index, book, module, settings.syncScroll]
  );

  // Чтение вслух: подсвечиваем текущий стих и ведём за ним текст (если человек сам не листает)
  const audio = useAudio();
  const userTouchAt = useRef(0);
  const speakingEl = useRef(null);
  const audioNav = useRef(null);
  useEffect(() => {
    const el = scroller.current;
    const clear = () => {
      speakingEl.current?.classList.remove('speaking');
      speakingEl.current = null;
    };
    if (!audio.active || audio.pane !== index || !audio.ref || !el || audio.moduleId !== module.id) return clear();
    const r = audio.ref;
    const target = book?.id === r.book ? el.querySelector(`#v-${r.chapter}-${r.verse}`) : null;
    if (!target) {
      // Человек ушёл читать другое место — запись играет, но текст за ней не тянем
      if (!audio.follow) return clear();
      const key = `${r.book}.${r.chapter}`;
      if (audioNav.current !== key) {
        audioNav.current = key;
        navigate(index, r, { push: false, flash: false, audio: true });
      }
      return;
    }
    audioNav.current = null;
    if (speakingEl.current !== target) {
      clear();
      target.classList.add('speaking');
      speakingEl.current = target;
    }
    if (audio.follow && Date.now() - userTouchAt.current > 4000) {
      const top = target.offsetTop - el.scrollTop;
      if (top < 40 || top > el.clientHeight * 0.6) el.scrollTo({ top: target.offsetTop - el.clientHeight * 0.25, behavior: settings.animations ? 'smooth' : 'auto' });
    }
  }, [audio.active, audio.ref, audio.pane, audio.moduleId, audio.follow, book, range, module.id]);

  const opts = useMemo(
    () => ({
      // Режим «как книга»: сплошной текст абзацами по разделам, без номеров, кнопок и пометок
      showVerseNumbers: settings.showVerseNumbers && !settings.bookMode,
      showStrongs: settings.showStrongs && module.features?.strongs && !settings.bookMode,
      showHeadings: settings.showHeadings,
      showXref: settings.showXrefButtons && !settings.focusMode && !settings.bookMode,
      inlineComments: settings.bookMode ? [] : settings.inlineCommentaries, // null — все включённые комментарии
      continuous: settings.continuousVerses || settings.bookMode,
      showIllus: settings.showIllustrations !== false && !settings.bookMode,
    }),
    [settings.showVerseNumbers, settings.showStrongs, settings.showHeadings, settings.showXrefButtons, settings.focusMode, settings.continuousVerses, settings.inlineCommentaries, settings.bookMode, settings.showIllustrations, module]
  );
  const hlRe = useMemo(() => highlightRegex(pane.highlight), [pane.highlight]);
  const flash = pane.flash ? pane.flash.split('.') : null;

  const bookIdx = module.books.findIndex((b) => b.id === book?.id);
  const prevBook = bookIdx > 0 ? module.books[bookIdx - 1] : null;
  const nextBook = bookIdx >= 0 && bookIdx < module.books.length - 1 ? module.books[bookIdx + 1] : null;

  return (
    <div
      className={`scroller${selection?.size ? ' selecting' : ''}`}
      ref={scroller}
      onScroll={(e) => {
        cancelPress();
        onScroll(e);
      }}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onWheel={() => (setDriver(index), (userTouchAt.current = Date.now()))}
      onTouchStart={() => (setDriver(index), (userTouchAt.current = Date.now()))}
      onPointerMove={onPointerMove}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onContextMenu={onContextMenu}
    >
      <div className={`text-col${settings.bookMode ? ' book-mode' : ''}`} dir={module.language === 'he' ? 'rtl' : undefined} lang={module.language || undefined}>
        {error && <div className="notice error-text">{error}</div>}
        {!error && (!book || !range) && (
          <div className="loading">
            <Loader2 className="spin" size={22} /> Загрузка…
          </div>
        )}
        {book && range && !error && (
          <>
            {range.start === 1 && prevBook && (
              <button className="book-jump" onClick={() => navigate(index, { book: prevBook.id, chapter: prevBook.verses.length, verse: 1 })}>
                <ChevronLeft size={18} /> {prevBook.name}
              </button>
            )}
            {Array.from({ length: range.end - range.start + 1 }, (_, k) => range.start + k).map((c) => (
              <Chapter
                key={`${book.id}-${c}`}
                bookId={book.id}
                bookName={book.meta.name}
                c={c}
                verses={book.data.chapters[c - 1]}
                headings={book.data.headings}
                xrefs={book.data.xrefs}
                counts={counts}
                comments={comments}
                illus={illus}
                opts={opts}
                hlRe={hlRe}
                isPsalm={book.id === 'Ps'}
                flashVerse={flash && flash[0] === book.id && +flash[1] === c ? +flash[2] : null}
                marks={marksFor(marks, book.id, c)}
                selected={selectedIn(selection, book.id, c)}
                {...afterProps(selActions, book.id, c)}
              />
            ))}
            {range.end === total && (
              <div className="book-end">
                {nextBook ? (
                  <button className="book-jump" onClick={() => navigate(index, { book: nextBook.id, chapter: 1, verse: 1 })}>
                    Следующая книга: {nextBook.name} <ChevronRight size={18} />
                  </button>
                ) : (
                  <div className="muted">Конец перевода</div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
