// Текст Библии: непрерывная прокрутка глав внутри книги (главы подгружаются сверху и снизу),
// нажатие на слово открывает словари, кнопка в конце стиха — параллельные места.
// Слова рендерятся HTML-строкой с делегированием событий: в главе может быть больше тысячи слов.
import React, { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, ChevronLeft, Loader2 } from 'lucide-react';
import { useApp } from '../App.jsx';
import { getBook } from '../core/modules.js';
import { crossrefCounts } from '../core/crossrefs.js';
import { verseHtml, wordAt, plainText } from '../core/verseMarkup.js';

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

const Chapter = memo(function Chapter({ bookId, bookName, c, verses, headings, xrefs, counts, opts, hlRe, flashVerse, isPsalm, selected }) {
  const sel = selected ? new Set(selected.split(',').map(Number)) : null;
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
              <p className={`verse${flashVerse === v ? ' flash' : ''}${sel?.has(v) ? ' selected' : ''}`} data-c={c} data-v={v} id={`v-${c}-${v}`} aria-selected={sel ? sel.has(v) : undefined}>
                {opts.showVerseNumbers && (
                  <button className="vn" data-act="verse" aria-label={`Стих ${v}: действия`}>
                    {v}
                  </button>
                )}
                <span className="vt" dangerouslySetInnerHTML={{ __html: verseHtml(text, { showStrongs: opts.showStrongs, highlight: hlRe }) }} />
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
  const { settings, openSheet, openPopover, popover, reportPosition, navigate, sheet, modules } = useApp();
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
  useEffect(() => {
    crossrefCounts().then(setCounts);
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
    clearTimeout(posTimer.current);
    posTimer.current = setTimeout(() => {
      const verses = el.querySelectorAll('.verse');
      const top = el.scrollTop + 12;
      let lo = 0;
      let hi = verses.length - 1;
      let found = verses[0];
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (verses[mid].offsetTop + verses[mid].offsetHeight > top) {
          found = verses[mid];
          hi = mid - 1;
        } else lo = mid + 1;
      }
      if (found) reportPosition(index, { book: book.id, chapter: +found.dataset.c, verse: +found.dataset.v });
    }, 140);
  };

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
    if (act === 'verse') return openSheet('verse', index, { ref: vref, text: plainText(text), moduleId: module.id });
    const w = e.target.closest('.w');
    if (w) {
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
      onPointerMove={onPointerMove}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onContextMenu={onContextMenu}
    >
      <div className="text-col">
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
                opts={opts}
                hlRe={hlRe}
                isPsalm={book.id === 'Ps'}
                flashVerse={flash && flash[0] === book.id && +flash[1] === c ? +flash[2] : null}
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
