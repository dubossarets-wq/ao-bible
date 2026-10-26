// Текст Библии: непрерывная прокрутка глав внутри книги (главы подгружаются сверху и снизу),
// нажатие на слово открывает словари, кнопка в конце стиха — параллельные места.
// Слова рендерятся HTML-строкой с делегированием событий: в главе может быть больше тысячи слов.
import { useSyncTouchScroll } from './useSyncTouchScroll.js';
import { lookupWord } from '../core/lexicon.js';
import { visibleInterval } from '../core/visibleInterval.js';
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
import { wasClosedOnWord, isDoubleTap, pulseFavorite, DOUBLE_TAP_MS } from '../core/tapState.js';
import { logChapter, minSeconds } from '../core/readLog.js';
import { creditChapter } from '../core/planStore.js';
import { sermonWith } from '../core/sermons.js';
import { formatRef } from '../core/books.js';
import { usePinchFont } from './usePinchFont.js';
import { t, useLang } from '../core/i18n.js';
import { drawPart, clearPart } from './partShape.js';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const HL_MS = 8000; // сколько держится подсветка слова из поиска после перехода

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
export const Chapter = memo(function Chapter({ bookId, bookName, c, verses, headings, xrefs, counts, comments, illus, opts, hlRe, hlVerse = null, flashVerse, isPsalm, selected, marks, from = 1, to = null, idp = '', noBookTitle = false, noChapterTitle = false, afterVerse = null, afterNode = null }) {
  useLang(); // глава в memo — подписи (номер главы, кнопки) обновляются при смене языка
  const sel = selected ? new Set(selected.split(',').map(Number)) : null;
  const mk = marks ? Object.fromEntries(marks.split(',').map((x) => x.split(':'))) : {};
  return (
    <div className="chapter" data-c={c}>
      {c === 1 && !noBookTitle && <h1 className="book-title">{bookName}</h1>}
      {!noChapterTitle && <h2 className="chapter-title">{isPsalm ? t('Псалом {n}', { n: c }) : t('Глава {n}', { n: c })}</h2>}
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
                aria-current={sel?.has(v) ? 'true' : undefined}
              >
                {opts.showVerseNumbers && (
                  <button className="vn" data-act="verse" aria-label={t('Стих {n}: действия', { n: v })}>
                    {v}
                  </button>
                )}
                {mk[v]?.includes('b') && <span className="vmark bm" title={t('Закладка')} aria-label={t('Закладка')} />}
                {mk[v]?.includes('s') && (
                  <button className="vmark sermon-mark" data-act="sermon" title={t('Открыть проповедь')} aria-label={t('Стих есть в проповеди. Открыть проповедь')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M15 12h-5" />
                      <path d="M15 8h-5" />
                      <path d="M19 17V5a2 2 0 0 0-2-2H4" />
                      <path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3" />
                    </svg>
                  </button>
                )}
                {/[fp]/.test(mk[v] || '') && (
                  <span className={`vmark fav-heart${mk[v].includes('p') ? ' part' : ''}`} title={mk[v].includes('p') ? t('Любимая часть стиха') : t('Любимый стих')} aria-label={mk[v].includes('p') ? t('Любимая часть стиха') : t('Любимый стих')}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 21s-7.6-4.7-9.7-9.4C.8 8.3 3 4.4 6.8 4.4c2.2 0 3.7 1.2 5.2 3 1.5-1.8 3-3 5.2-3 3.8 0 6 3.9 4.5 7.2C19.6 16.3 12 21 12 21z" fill="currentColor" />
                    </svg>
                  </span>
                )}
                {mk[v]?.includes('c') && (
                  <span className="vmark col-mark" title={t('Стих в подборке')} aria-label={t('Стих в подборке')}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" fill="currentColor" />
                    </svg>
                  </span>
                )}
                <span className="vt" dangerouslySetInnerHTML={{ __html: verseHtml(text, { showStrongs: opts.showStrongs, highlight: hlRe && (hlVerse == null || hlVerse === v) ? hlRe : null, interlinear: opts.interlinear }) }} />
                {mk[v]?.includes('n') && (
                  <button className="note-tag" data-act="note" aria-label={t('Заметка к стиху')} title={t('Заметка')}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                )}
                {opts.showXref && n > 0 && (
                  <button className="xr" data-act="xref" aria-label={t('Параллельные места: {n}', { n })}>
                    [⇅&nbsp;{n}]
                  </button>
                )}
                {opts.showIllus && illus?.has(`${bookId}.${c}.${v}`) && (
                  <button className="il" data-act="illus" aria-label={t('Иллюстрация к стиху')} title={t('Иллюстрация')}>
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
                  // только комментарии на языке этого перевода (у синодального — русские, у KJV — английские)
                  ?.filter((cm) => (!opts.inlineComments || opts.inlineComments.includes(cm.id)) && (!opts.lang || cm.lang === opts.lang))
                  .map((cm) => (
                    <button key={cm.id} className="cm" data-act="comment" data-m={cm.id} aria-label={t('Комментарий: {name}', { name: cm.name })}>
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
  const { settings, openSheet, openPopover, closePopover, popover, reportPosition, navigate, clearHighlight, sheet, modules, marks, toast, toggleFavorite, panes } = useApp();
  const scroller = useRef(null);
  usePinchFont(scroller);
  const [book, setBook] = useState(null); // { id, data, meta }
  const [range, setRange] = useState(null);
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState(null);
  const pending = useRef(null);
  const prependAt = useRef(0); // когда последний раз подгружали главу сверху
  const lastY = useRef(0);
  const posTimer = useRef(null);
  const pendingPop = useRef(0);
  useEffect(() => () => clearTimeout(pendingPop.current), []);
  const activeWord = useRef(null);
  const ref = pane.ref;

  // Счётчики параллельных мест (пересчитываются при включении/выключении модулей)
  const [comments, setComments] = useState(null);
  const [illus, setIllus] = useState(null);
  // Индексы (параллельные места — 1,3 МБ, иллюстрации — 2 МБ) читаем, когда текст уже на экране и браузер свободен:
  // раньше они задерживали первый стих на 0,3–0,5 с. Значки ссылок и картинок появляются чуть позже.
  const bookReady = !!book;
  useEffect(() => {
    if (!bookReady) return;
    let alive = true;
    const run = () => {
      if (!alive) return;
      crossrefCounts().then((m) => alive && setCounts(m));
      commentaryIndex().then((m) => alive && setComments(m.size ? m : null));
      illustrationIndex().then((m) => alive && setIllus(m.size ? m : null));
    };
    const idle = typeof requestIdleCallback === 'function';
    const id = idle ? requestIdleCallback(run, { timeout: 1200 }) : setTimeout(run, 300);
    return () => {
      alive = false;
      if (idle) cancelIdleCallback(id);
      else clearTimeout(id);
    };
  }, [modules, bookReady]);

  // Навигация: загрузить книгу и прокрутить к стиху
  useEffect(() => {
    let alive = true;
    setError(null);
    const meta = module.books.find((b) => b.id === ref.book);
    if (!meta) {
      setError(t('В переводе {module} нет книги «{book}».', { module: module.name, book: ref.book }));
      return;
    }
    clearLivePosition(index);
    getBook(module.id, ref.book).then((data) => {
      if (!alive) return;
      if (!data) return setError(t('Книга не открылась. Переустановите модуль в библиотеке.'));
      const total = data.chapters.length;
      const c = Math.min(Math.max(1, ref.chapter), total);
      pending.current = { type: 'nav', c, v: ref.verse };
      setBook({ id: ref.book, data, meta });
      // Сначала текущая и следующая глава (снизу нужен запас, чтобы стих встал к верхнему краю), предыдущая —
      // следом, когда первый кадр уже на экране (loadEdges после смены ленты; место держит keepAnchor)
      setRange({ start: c, end: Math.min(total, c + 1) });
    }).catch(() => alive && setError(t('Книга не открылась. Перезапустите приложение.')));
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
      ownTop.current = el.scrollTop;
      setAnchor();
    } else if (p.type === 'prepend') {
      // Сверху добавилась глава — сдвигаем прокрутку на её высоту, чтобы текст остался на месте.
      // Берём текущее положение (прокрутка могла уйти дальше, пока глава рисовалась); подстройка браузера
      // отключена (overflow-anchor: none), иначе сдвиг получился бы двойным.
      // iPhone во время инерции перебивает присвоение scrollTop — тогда текст уезжал вниз, тут же подгружалась
      // ещё глава, и всё летело к началу книги. Поэтому гасим инерцию на кадр и проверяем, что сдвиг применился.
      const target = el.scrollTop + (el.scrollHeight - p.height);
      el.style.overflowY = 'hidden';
      el.scrollTop = target;
      lastY.current = target;
      ownTop.current = el.scrollTop;
      requestAnimationFrame(() => {
        el.style.overflowY = '';
        if (Math.abs(el.scrollTop - target) > 40) el.scrollTop = target;
        lastY.current = el.scrollTop;
      });
    } else if (p.type === 'trim') {
      // Лента обрезана: текущая глава должна остаться на том же месте экрана. Отсчёт — от прокрутки до обрезки:
      // браузер, убрав главы сверху, сам урезает scrollTop до новой высоты
      const anchor = el.querySelector(`.chapter[data-c="${p.c}"]`);
      if (anchor) el.scrollTop = p.st + anchor.offsetTop - p.top;
      lastY.current = el.scrollTop;
      ownTop.current = el.scrollTop;
    }
  }, [range, book]);

  // Любое касание мимо выделенного слова (другой стих, другое слово, панель, пустое место) только снимает
  // выделение: это касание больше ничего не делает — новое слово не выделяется, выборка не открывается.
  // Выборка словарей и открытая статья — не «мимо»: там выделение показывает, о каком слове речь.
  const swallowTap = useRef(false);
  const wordTapAt = useRef(0); // когда последний раз нажали на слово
  useEffect(() => {
    const onDown = (e) => {
      const w = activeWord.current;
      swallowTap.current = false;
      if (!w || w.contains(e.target) || e.target.closest?.('.word-pop, .sheet, .tour')) return;
      // Быстрое второе касание в тот же стих — это двойное касание (в любимые), а не «мимо слова»
      if (Date.now() - wordTapAt.current < DOUBLE_TAP_MS && w.closest('.verse')?.contains(e.target)) return;
      w.classList.remove('active');
      activeWord.current = null;
      swallowTap.current = true;
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, []);

  // Плашки частей стихов стоят по координатам строк — перерисовываем при смене ширины и после загрузки шрифтов
  const [relayoutN, setRelayout] = useState(0);
  // Слова выбранной части стиха и любимых частей — отмечаем классами прямо в тексте.
  // Только когда меняются сами части, текст или раскладка: раньше это шло на каждую перерисовку главы
  // (каждый звучащий стих, каждое окно и уведомление) и с отмеченными частями тормозило в разы.
  const { favParts } = useApp();
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.querySelectorAll('.w.fav-part').forEach((w) => w.classList.remove('fav-part'));
    clearPart(el); // прежняя подложка выбранной части
    const mark = (b, c, v, from, to, cls) =>
      el.querySelectorAll(`.verse[data-b="${b}"][data-c="${c}"][data-v="${v}"] .w`).forEach((w) => +w.dataset.i >= from && +w.dataset.i <= to && w.classList.add(cls));
    // Только главы, которые сейчас на экране (раньше — все отмеченные части всей Библии с поиском по тексту)
    for (const [k, verses] of favParts) {
      const [b, c] = k.split('.');
      if (!book || b !== book.id || !range || +c < range.start || +c > range.end) continue;
      for (const [v, [from, to]] of Object.entries(verses)) {
        mark(b, c, v, from, to, 'fav-part');
        drawPart(el, { key: `${b}.${c}.${v}`, from, to }, 'fav'); // любимая часть — цельной плашкой цвета сердечка
      }
    }
    if (part?.from != null) {
      drawPart(el, part); // выбранная часть — одной цельной плашкой под текстом
    }
  }, [favParts, part, book, range, settings, relayoutN, pane.highlight, module.id]);

  useEffect(() => {
    const el = scroller.current;
    if (!el || !window.ResizeObserver) return;
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => el.clientWidth !== w && ((w = el.clientWidth), setRelayout((n) => n + 1)));
    ro.observe(el);
    const fontsDone = () => setRelayout((n) => n + 1);
    document.fonts?.addEventListener?.('loadingdone', fontsDone);
    return () => {
      ro.disconnect();
      document.fonts?.removeEventListener?.('loadingdone', fontsDone);
    };
  }, []);

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
    if (Math.abs(el.scrollTop - ownTop.current) >= 1) {
      keep.current = null;
      clearTimeout(keepTimer.current);
      keepTimer.current = setTimeout(setAnchor, 150);
    }
    loadEdges();
    // Поправка удержания места (текст перестроился) — не движение: вторую панель не тянем и не доводим
    const kept = Math.abs(el.scrollTop - keepTop.current) < 1;
    if (kept) keepTop.current = -1;
    else emitPosition();
    // Долгое чтение: лента глав растёт — когда прокрутка стихла, оставляем по две главы вокруг текущей
    clearTimeout(trimTimer.current);
    if (range.end - range.start > 6) trimTimer.current = setTimeout(trimRibbon, 600);
    // Колесо и обычная прокрутка: остановились — доводим вторую панель (пальцем на телефоне — сигнал из useSyncTouchScroll)
    if (settings.syncScroll && !touchSync && isDriver(index) && !kept) {
      clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(emitSettle, 160);
    }
    // Текущий стих — раз в кадр, по закэшированным координатам (без перерисовки всего приложения)
    if (!frame.current) frame.current = requestAnimationFrame(trackPosition);
  };

  // Подгрузка соседних глав у краёв ленты
  const loadEdges = () => {
    const el = scroller.current;
    if (!el || !range || pending.current) return;
    const y = el.scrollTop;
    if (y < 900 && range.start > 1 && Date.now() - prependAt.current > 300) {
      prependAt.current = Date.now();
      pending.current = { type: 'prepend', top: y, height: el.scrollHeight };
      setRange((r) => ({ ...r, start: r.start - 1 }));
    } else if (el.scrollHeight - y - el.clientHeight < 1400 && range.end < total) {
      setRange((r) => ({ ...r, end: r.end + 1 }));
    }
  };
  // После каждого изменения ленты — ещё раз: у самого верха прокрутки событий уже нет, а сверху может
  // не хватать глав (быстро долистали до начала ленты)
  useEffect(() => {
    const id = setTimeout(loadEdges, 350);
    return () => clearTimeout(id);
  }, [range]);

  const trimTimer = useRef(0);
  useEffect(() => () => clearTimeout(trimTimer.current), []);
  const trimRibbon = () => {
    const el = scroller.current;
    const at = verseAtTop();
    if (!el || !at || !range || pending.current) return;
    const c = at.found.c;
    const start = Math.max(range.start, c - 2);
    const end = Math.min(range.end, c + 2);
    if (start === range.start && end === range.end) return;
    const anchor = el.querySelector(`.chapter[data-c="${c}"]`);
    if (!anchor) return;
    pending.current = { type: 'trim', c, top: anchor.offsetTop, st: el.scrollTop };
    setRange((r) => {
      const s = Math.max(r.start, c - 2);
      const e = Math.min(r.end, c + 2);
      if (s === r.start && e === r.end) {
        pending.current = null; // обрезать нечего — без перерисовки, иначе подгрузка глав осталась бы заблокированной
        return r;
      }
      return { ...r, start: s, end: e };
    });
  };
  // Координаты низа каждого стиха; кэш сбрасывается, когда меняется высота текста (подгрузка глав, шрифт)
  const positions = useRef(null);
  const frame = useRef(0);
  const measure = () => {
    const els = scroller.current?.querySelectorAll('.verse') || [];
    positions.current = Array.from(els, (v, i) => ({ i, top: v.offsetTop, bottom: v.offsetTop + v.offsetHeight, c: +v.dataset.c, v: +v.dataset.v }));
    positions.current.byKey = new Map(positions.current.map((p) => [`${p.c}:${p.v}`, p]));
  };
  // Стих у верхнего края и где он (по закэшированным координатам — без чтения разметки на каждом кадре)
  const verseAtTop = () => {
    const el = scroller.current;
    if (!el || !book) return null;
    if (!positions.current) measure();
    const list = positions.current;
    if (!list.length) return null;
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
    return { found, top };
  };
  // Синхронная прокрутка: ведущая панель передаёт стих и долю его высоты — сразу в событии прокрутки,
  // не дожидаясь следующего кадра (иначе вторая панель заметно отставала при быстрой прокрутке)
  // Доля считается от начала стиха до начала следующего (вместе с отступом и заголовком между ними) —
  // так вторая панель едет непрерывно, без скачка на каждой границе стихов
  const span = (list, p) => Math.max(1, (list[p.i + 1]?.top ?? p.bottom) - p.top);
  const emitPosition = () => {
    if (!settings.syncScroll || !isDriver(index)) return;
    const el = scroller.current;
    if (!el || !book) return;
    if (!positions.current) measure();
    const list = positions.current;
    if (!list.length) return;
    const top = el.scrollTop + 12;
    // последний стих, начало которого уже выше линии
    let lo = 0;
    let hi = list.length - 1;
    let found = list[0];
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].top <= top) {
        found = list[mid];
        lo = mid + 1;
      } else hi = mid - 1;
    }
    const frac = Math.max(0, Math.min(1, (top - found.top) / span(list, found)));
    // То же место второй раз не передаём: при ведении пальцем сюда приходят и сдвиг, и событие прокрутки
    const last = lastEmit.current;
    if (last && last.found === found && Math.abs(last.frac - frac) < 1e-4) return;
    lastEmit.current = { found, frac };
    emitSync(index, { ref: { book: book.id, chapter: found.c, verse: found.v }, frac });
  };
  const lastEmit = useRef(null);
  // Прокрутка остановилась: вторая панель доводится так, чтобы стих стоял на той же высоте, что и здесь
  // (на ходу доли стихов разной длины не дают строкам совпасть). Опорный стих — тот, чьё начало видно
  // в верхней половине экрана, иначе тот, что закрывает верх.
  const settleTimer = useRef(0);
  useEffect(() => () => clearTimeout(settleTimer.current), []);
  const emitSettle = () => {
    if (!settings.syncScroll || !isDriver(index)) return;
    const el = scroller.current;
    if (!el || !book) return;
    if (!positions.current) measure();
    const list = positions.current;
    if (!list.length) return;
    const y0 = el.scrollTop;
    let lo = 0;
    let hi = list.length - 1;
    let i = list.length;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].top >= y0) {
        i = mid;
        hi = mid - 1;
      } else lo = mid + 1;
    }
    const a = i < list.length && list[i].top - y0 <= el.clientHeight / 2 ? list[i] : list[Math.max(0, i - 1)];
    emitSync(index, { settle: { ref: { book: book.id, chapter: a.c, verse: a.v }, y: a.top - y0 } });
  };
  // Две панели с синхронной прокруткой на телефоне — прокрутку пальцем ведём сами, чтобы вторая панель не отставала
  const touchSync = !!settings.syncScroll && !!panes[1] && typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  useSyncTouchScroll(scroller, touchSync, emitPosition, emitSettle);
  const trackPosition = () => {
    frame.current = 0;
    const at = verseAtTop();
    if (!at) return;
    const { found } = at;
    const ref = { book: book.id, chapter: found.c, verse: found.v };
    setLivePosition(index, ref);
    // В историю и сохранение — когда прокрутка стихла
    clearTimeout(posTimer.current);
    posTimer.current = setTimeout(() => reportPosition(index, ref), 450);
  };
  // Верхний стих стоит на месте, когда выше экрана меняется высота: после открытия догружаются подписи
  // толкований, значки ссылок и картинок, шрифт. Привязки прокрутки браузера у нас нет (в Safari её нет вовсе,
  // а в ленте она отключена — главы сверху добавляем сами), поэтому держим место сами — пока человек не листает.
  const keep = useRef(null); // { node, top } — стих у верхнего края и его отступ от края
  const keepTimer = useRef(0);
  const keepTop = useRef(-1); // прокрутка после поправки удержания места
  const ownTop = useRef(-1); // прокрутка, которую поставило само приложение: событие с ней — не прокрутка человека
  useEffect(() => () => clearTimeout(keepTimer.current), []);
  const setAnchor = () => {
    const el = scroller.current;
    const at = el && verseAtTop();
    const node = at && el.querySelector(`.verse[data-c="${at.found.c}"][data-v="${at.found.v}"]`);
    keep.current = node ? { node, top: node.offsetTop - el.scrollTop } : null;
  };
  const keepAnchor = () => {
    const el = scroller.current;
    const a = keep.current;
    if (!el || !a || !a.node.isConnected) return;
    const d = a.node.offsetTop - el.scrollTop - a.top;
    if (Math.abs(d) < 1) return;
    el.scrollTop += d;
    ownTop.current = el.scrollTop;
    keepTop.current = el.scrollTop;
    lastY.current = el.scrollTop;
  };
  // После каждой перерисовки главы (догрузились подписи, значки) — поправка до показа кадра
  useLayoutEffect(() => {
    keepAnchor();
  });
  useEffect(() => {
    positions.current = null;
    const col = scroller.current?.firstElementChild;
    if (!col) return;
    const ro = new ResizeObserver(() => {
      positions.current = null;
      keepAnchor();
      // Текст перестроился (ширина, шрифт, подписи) — место в шапке и истории пересчитываем по новой раскладке
      if (!frame.current) frame.current = requestAnimationFrame(trackPosition);
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
    return visibleInterval(() => {
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
        if (finished.length) toast(t('План «{plan}»: на сегодня всё ✓', { plan: t(finished[0]) }));
        else if (credited.length) toast(t('Засчитано в план «{plan}»: {ref}', { plan: t(credited[0]), ref: formatRef({ book: book.id, chapter: c, verse: 1 }).replace(/:1$/, '') }));
      }
    }, 1000);
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
      clearTimeout(pendingPop.current);
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
    // Номер стиха — то же, что долгое нажатие: выделение стиха и одна общая панель действий
    if (act === 'verse') return onSelect?.(vref, 'start');
    const sn = e.target.closest('.sn');
    if (sn) {
      const token = wordAt(text, +sn.dataset.i);
      if (!token?.strongs) return;
      closePopover();
      return openSheet('dict', index, { token: { text: token.text, strongs: token.strongs, morph: token.morph || null }, ref: vref, moduleId: module.id, verseText: plainText(text), wi: +sn.dataset.i, autoOpen: true, initial: 'full' });
    }
    const w = e.target.closest('.w');
    if (w) {
      // Нажатие, которым закрыли выборку, или повторное нажатие на выделенное слово — снимаем выделение, выборку не открываем
      if (wasClosedOnWord(w) || (w === activeWord.current && !popover && !sheet)) {
        activeWord.current?.classList.remove('active');
        w.classList.remove('active');
        activeWord.current = null;
        return;
      }
      const token = wordAt(text, +w.dataset.i);
      if (!token) return;
      activeWord.current?.classList.remove('active');
      w.classList.add('active');
      activeWord.current = w;
      wordTapAt.current = Date.now();
      const tok = { text: token.text, strongs: token.strongs || null, morph: token.morph || null };
      // Окошко словарей — после паузы двойного касания: иначе оно успевает открыться над пальцем
      // и второе касание попадает в него, а не в стих (двойное касание — в любимые)
      clearTimeout(pendingPop.current);
      lookupWord({ token: tok, ref: vref }).catch(() => {}); // начинаем искать в словарях, пока ждём двойного касания
      pendingPop.current = setTimeout(() => {
        if (activeWord.current !== w) return;
        const r = w.getBoundingClientRect();
        openPopover({
          pane: index,
          token: tok,
          ref: vref,
          rect: { left: r.left, top: r.top, bottom: r.bottom, width: r.width },
          payload: { token: tok, ref: vref, moduleId: module.id, verseText: plainText(text), wi: +w.dataset.i },
        });
      }, DOUBLE_TAP_MS);
    }
  };

  // Ведомая панель: встаём на стих ведущей. Если стих не загружен или книга другая — переходим туда.
  const syncNav = useRef(null);
  // Доводка после остановки: bias — сдвиг от положения по доле стиха; при следующей прокрутке он плавно сходит на нет
  const bias = useRef(0);
  const base = useRef(null); // { list, y } — последнее положение по доле стиха
  const settleRaf = useRef(0);
  const stopSettle = () => {
    if (!settleRaf.current) return;
    cancelAnimationFrame(settleRaf.current);
    settleRaf.current = 0;
    if (base.current) bias.current = scroller.current.scrollTop - base.current.y;
  };
  const resetFollow = () => {
    if (settleRaf.current) cancelAnimationFrame(settleRaf.current);
    settleRaf.current = 0;
    bias.current = 0;
    base.current = null;
    lastEmit.current = null;
  };
  useEffect(() => () => cancelAnimationFrame(settleRaf.current), []);
  useEffect(
    () =>
      onSync(index, ({ ref: r, frac, settle }) => {
        const el = scroller.current;
        const ref = settle ? settle.ref : r;
        if (!settings.syncScroll || !el || isDriver(index) || !book) return;
        if (!module.books.some((b) => b.id === ref.book)) return;
        // Координаты стиха — из кэша (без поиска по странице и замеров на каждом шаге прокрутки)
        if (book.id === ref.book && !positions.current) measure();
        const list = positions.current;
        const pos = book.id === ref.book ? list?.byKey?.get(`${ref.chapter}:${ref.verse}`) : null;
        if (settle) {
          if (!pos) return;
          let target = pos.top - settle.y;
          if (settle.y < 0) target = Math.min(target, pos.top + span(list, pos) - 24); // стих здесь короче — не уходим за него
          target = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, Math.round(target)));
          const from = el.scrollTop;
          if (Math.abs(target - from) < 1) return;
          if (settleRaf.current) cancelAnimationFrame(settleRaf.current);
          const t0 = performance.now();
          const step = (now) => {
            const k = Math.min(1, (now - t0) / 220);
            el.scrollTop = from + (target - from) * (1 - (1 - k) ** 3);
            lastY.current = el.scrollTop;
            settleRaf.current = k < 1 ? requestAnimationFrame(step) : 0;
            if (!settleRaf.current && base.current) bias.current = el.scrollTop - base.current.y;
          };
          settleRaf.current = requestAnimationFrame(step);
          return;
        }
        if (pos) {
          stopSettle();
          const y = pos.top + frac * span(list, pos) - 12;
          // доводка уходит по мере прокрутки: за ~160 px движения — в e раз
          const moved = base.current?.list === list ? Math.abs(y - base.current.y) : 0;
          bias.current *= Math.exp(-moved / 160);
          if (Math.abs(bias.current) < 0.5) bias.current = 0;
          base.current = { list, y };
          el.scrollTop = y + bias.current;
          lastY.current = el.scrollTop;
          return;
        }
        resetFollow();
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
      // Под раскрытым проигрывателем текста не видно — без плавной прокрутки (она стоила кадров «караоке»)
      const hidden = document.documentElement.classList.contains('player-open');
      if (top < 40 || top > el.clientHeight * 0.6) el.scrollTo({ top: target.offsetTop - el.clientHeight * 0.25, behavior: settings.animations && !hidden ? 'smooth' : 'auto' });
    }
  }, [audio.active, audio.ref, audio.pane, audio.moduleId, audio.follow, book, range, module.id]);

  const opts = useMemo(
    () => ({
      // Режим «как книга»: сплошной текст абзацами по разделам, без номеров, кнопок и пометок
      showVerseNumbers: settings.showVerseNumbers && !settings.bookMode,
      showStrongs: settings.showStrongs && module.features?.strongs && !settings.bookMode,
      interlinear: !!module.features?.interlinear,
      showHeadings: settings.showHeadings,
      showXref: settings.showXrefButtons && !settings.focusMode && !settings.bookMode,
      inlineComments: settings.bookMode ? [] : settings.inlineCommentaries, // null — все включённые комментарии
      lang: module.language || 'ru', // комментарии у стихов — на языке перевода
      continuous: settings.continuousVerses || settings.bookMode,
      showIllus: settings.showIllustrations !== false && !settings.bookMode,
    }),
    [settings.showVerseNumbers, settings.showStrongs, settings.showHeadings, settings.showXrefButtons, settings.focusMode, settings.continuousVerses, settings.inlineCommentaries, settings.bookMode, settings.showIllustrations, module]
  );
  // Слово из поиска подсвечено только в стихе, к которому перешли: несколько секунд, потом плавно гаснет
  // (сразу — при касании текста). Прежний формат (просто строка) и старые подсветки после перезапуска не показываем.
  const hlObj = pane.highlight && typeof pane.highlight === 'object' && Date.now() - (pane.highlight.t || 0) < HL_MS ? pane.highlight : null;
  const hlRe = useMemo(() => highlightRegex(hlObj?.q), [hlObj?.q]);
  const hlAt = hlObj ? hlObj.at.split('.') : null;
  const [hlFade, setHlFade] = useState(false);
  useEffect(() => {
    setHlFade(false);
    if (!pane.highlight) return;
    if (!hlObj) {
      clearHighlight(index);
      return;
    }
    const left = HL_MS - (Date.now() - hlObj.t);
    const a = setTimeout(() => setHlFade(true), Math.max(0, left - 800));
    const b = setTimeout(() => clearHighlight(index), Math.max(0, left));
    return () => (clearTimeout(a), clearTimeout(b));
  }, [pane.highlight]);
  const dropHighlight = () => {
    if (!pane.highlight || hlFade) return;
    setHlFade(true);
    setTimeout(() => clearHighlight(index), 700);
  };
  const flash = pane.flash ? pane.flash.split('.') : null;

  const bookIdx = module.books.findIndex((b) => b.id === book?.id);
  const prevBook = bookIdx > 0 ? module.books[bookIdx - 1] : null;
  const nextBook = bookIdx >= 0 && bookIdx < module.books.length - 1 ? module.books[bookIdx + 1] : null;

  return (
    <div
      className={`scroller text-scroller${selection?.size ? ' selecting' : ''}${hlFade ? ' hl-fade' : ''}`}
      ref={scroller}
      onScroll={(e) => {
        cancelPress();
        onScroll(e);
      }}
      onClick={onClick}
      onPointerDown={(e) => {
        dropHighlight();
        onPointerDown(e);
      }}
      onWheel={() => (setDriver(index), resetFollow(), (userTouchAt.current = Date.now()))}
      onTouchStart={() => (setDriver(index), resetFollow(), (userTouchAt.current = Date.now()))}
      onPointerMove={onPointerMove}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onContextMenu={onContextMenu}
    >
      <div className={`text-col${settings.bookMode ? ' book-mode' : ''}`} dir={module.language === 'he' ? 'rtl' : undefined} lang={module.language || undefined}>
        {error && <div className="notice error-text">{error}</div>}
        {!error && (!book || !range) && (
          <div className="loading">
            <Loader2 className="spin" size={22} /> {t('Загрузка…')}
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
                hlRe={hlAt && hlAt[0] === book.id && +hlAt[1] === c ? hlRe : null}
                hlVerse={hlAt && hlAt[0] === book.id && +hlAt[1] === c ? +hlAt[2] : null}
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
                    {t('Следующая книга: {name}', { name: nextBook.name })} <ChevronRight size={18} />
                  </button>
                ) : (
                  <div className="muted">{t('Конец перевода')}</div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
