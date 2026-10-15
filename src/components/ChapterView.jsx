// Текст Библии: непрерывная прокрутка глав внутри книги (главы подгружаются сверху и снизу),
// нажатие на слово открывает словари, кнопка в конце стиха — параллельные места.
// Слова рендерятся HTML-строкой с делегированием событий: в главе может быть больше тысячи слов.
import React, { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, ChevronLeft, Loader2 } from 'lucide-react';
import { useApp } from '../App.jsx';
import { getBook } from '../core/modules.js';
import { crossrefCounts } from '../core/crossrefs.js';
import { commentaryIndex } from '../core/commentary.js';
import { setLivePosition, clearLivePosition } from '../core/livePosition.js';
import { setDriver, isDriver, onSync, emitSync } from '../core/scrollSync.js';
import { verseHtml, wordAt, plainText } from '../core/verseMarkup.js';
import { wasClosedOnWord } from '../core/tapState.js';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function highlightRegex(query) {
  if (!query) return null;
  const words = query
    .toLowerCase()
    .split(/[\s\p{P}]+/u)
    .filter((w) => w.length > 1)
    .map((w) => escapeRe(w).replace(/[её]/g, '[её]'));
  return words.length ? new RegExp(words.join('|'), 'iu') : null;
}

const Chapter = memo(function Chapter({ bookId, bookName, c, verses, headings, xrefs, counts, comments, opts, hlRe, flashVerse, isPsalm, selected, marks }) {
  const sel = selected ? new Set(selected.split(',').map(Number)) : null;
  const mk = marks ? Object.fromEntries(marks.split(',').map((x) => x.split(':'))) : {};
  return (
    <div className="chapter" data-c={c}>
      {c === 1 && <h1 className="book-title">{bookName}</h1>}
      <h2 className="chapter-title">{isPsalm ? `Псалом ${c}` : `Глава ${c}`}</h2>
      <div className={`verses ${opts.continuous ? 'continuous' : ''}`}>
        {verses.map((text, i) => {
          const v = i + 1;
          if (!text) return null;
          const heading = opts.showHeadings && headings?.[`${c}:${v}`];
          const n = (counts?.get(`${bookId}.${c}.${v}`) || 0) + (xrefs?.[`${c}:${v}`]?.length || 0);
          return (
            <React.Fragment key={v}>
              {heading && <h3 className="section-title">{heading}</h3>}
              <p
                className={`verse${flashVerse === v ? ' flash' : ''}${sel?.has(v) ? ' selected' : ''}${mk[v]?.includes('f') ? ' fav' : ''}`}
                data-c={c}
                data-v={v}
                id={`v-${c}-${v}`}
                aria-selected={sel ? sel.has(v) : undefined}
              >
                {opts.showVerseNumbers && (
                  <button className="vn" data-act="verse" aria-label={`Стих ${v}: действия`}>
                    {v}
                  </button>
                )}
                {mk[v]?.includes('b') && <span className="vmark bm" title="Закладка" aria-label="Закладка" />}
                {mk[v]?.includes('f') && (
                  <span className="vmark fav-star" title="В избранном" aria-label="В избранном">
                    ★
                  </span>
                )}
                <span className="vt" dangerouslySetInnerHTML={{ __html: verseHtml(text, { showStrongs: opts.showStrongs, highlight: hlRe }) }} />
                {comments?.get(`${bookId}.${c}.${v}`)?.map((cm) => (
                  <button key={cm.id} className="cm" data-act="comment" data-m={cm.id} aria-label={`Комментарий: ${cm.name}`}>
                    {cm.name}
                  </button>
                ))}
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
              </p>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
});

const LONG_PRESS_MS = 450;

// Отметки главы строкой «5:fb,7:n» — примитив для memo
function marksFor(marks, bookId, c) {
  const row = marks?.get(`${bookId}.${c}`);
  return row ? Object.entries(row).map(([v, f]) => `${v}:${f}`).join(',') : null;
}

// Строка номеров выделенных стихов главы («5,6») — примитив, чтобы memo главы не сбрасывался зря
function selectedIn(selection, bookId, c) {
  if (!selection?.size) return null;
  const prefix = `${bookId}.${c}.`;
  const out = [];
  for (const k of selection) if (k.startsWith(prefix)) out.push(k.slice(prefix.length));
  return out.length ? out.join(',') : null;
}

// selection — Set ключей «Книга.глава.стих»; onSelect(ref, 'start' | 'toggle') — выделение стихов
export default function ChapterView({ index, pane, module, onScrollDirection, selection, onSelect }) {
  const { settings, openSheet, openPopover, popover, reportPosition, navigate, sheet, modules, marks } = useApp();
  const scroller = useRef(null);
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
  useEffect(() => {
    crossrefCounts().then(setCounts);
    commentaryIndex().then((m) => setComments(m.size ? m : null));
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
    });
    return () => {
      alive = false;
    };
  }, [module.id, pane.nav]);

  useLayoutEffect(() => {
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
    const verseEl = e.target.closest('.verse');
    if (!verseEl || !book) return;
    const c = +verseEl.dataset.c;
    const v = +verseEl.dataset.v;
    const vref = { book: book.id, chapter: c, verse: v };
    // В режиме выделения нажатие на стих добавляет или убирает его из выделения
    if (selection?.size) return onSelect?.(vref, 'toggle');
    const text = book.data.chapters[c - 1][v - 1];
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'xref') return openSheet('xrefs', index, { ref: vref, moduleId: module.id });
    if (act === 'note') return openSheet('note', index, { refs: [vref], moduleId: module.id });
    if (act === 'comment') return openSheet('commentary', index, { ref: vref, moduleId: e.target.closest('[data-m]').dataset.m });
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

  const opts = useMemo(
    () => ({
      showVerseNumbers: settings.showVerseNumbers,
      showStrongs: settings.showStrongs && module.features?.strongs,
      showHeadings: settings.showHeadings,
      showXref: settings.showXrefButtons && !settings.focusMode,
      continuous: settings.continuousVerses,
    }),
    [settings.showVerseNumbers, settings.showStrongs, settings.showHeadings, settings.showXrefButtons, settings.focusMode, settings.continuousVerses, module]
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
      onWheel={() => setDriver(index)}
      onTouchStart={() => setDriver(index)}
      onPointerMove={onPointerMove}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onContextMenu={onContextMenu}
    >
      <div className="text-col" dir={module.language === 'he' ? 'rtl' : undefined} lang={module.language || undefined}>
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
                opts={opts}
                hlRe={hlRe}
                isPsalm={book.id === 'Ps'}
                flashVerse={flash && flash[0] === book.id && +flash[1] === c ? +flash[2] : null}
                marks={marksFor(marks, book.id, c)}
                selected={selectedIn(selection, book.id, c)}
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
