// Выбор места: книга → глава → стих. Сверху — одно поле: ссылка («Ин 3:16», Enter — переход)
// или первые буквы книги («кор», «1 ин») — список книг сразу сужается до подходящих.
// Ниже — недавние книги (текущая первой) и переключатель «Ветхий / Новый Завет / Апокрифы»
// (свайп по окну влево-вправо тоже переключает). Шаги сменяют друг друга сдвигом: вперёд — справа, назад — слева.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, CornerDownLeft, Search, X } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { parseHumanRef, findBookId, testamentOf, bookMeta } from '../core/books.js';
import { groupByCategory, categoryOf } from '../core/bookCategories.js';
import { t, N_ } from '../core/i18n.js';

const TESTAMENTS = [
  ['OT', N_('Ветхий Завет')],
  ['NT', N_('Новый Завет')],
  ['AP', N_('Апокрифы')],
];

// Сравнение без регистра, точек, пробелов и дефисов; «ё» = «е»: «1 кор» ≈ «1Кор.»
const norm = (s) => s.toLowerCase().replace(/ё/g, 'е').replace(/[\s.\-–]/g, '');
const words = (s) => s.toLowerCase().replace(/ё/g, 'е').split(/[\s.\-–]+/).filter((w) => w.length > 1);
// Только буквы (можно с номером книги впереди: «1 кор») — ищем книгу; цифры после букв — это уже ссылка
const isBookQuery = (q) => /^\s*[1-4]?\s*([^\d\s:.,][^\d:,]*)?$/.test(q) && q.trim() !== '';

function matchBooks(books, q) {
  const k = norm(q);
  if (!k) return [];
  const alias = findBookId(q);
  const hit = (b) => b.id === alias || norm(b.short).startsWith(k) || norm(b.name).startsWith(k) || words(b.name).some((w) => w.startsWith(k));
  const list = books.filter(hit);
  // Точное сокращение («мф», «ин») — первым
  return alias ? [...list.filter((b) => b.id === alias), ...list.filter((b) => b.id !== alias)] : list;
}

const keyboardClick = (e) => e?.detail === 0; // нажали Enter/пробел, а не пальцем или мышью

export default function BookNavigator({ pane, onClose }) {
  const { panes, bibles, navigate } = useApp();
  const p = panes[pane];
  const module = bibles.find((b) => b.id === p.moduleId) || bibles[0];
  const [book, setBook] = useState(null);
  const [chapter, setChapter] = useState(null);
  const [query, setQuery] = useState('');
  const [err, setErr] = useState('');
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const listScroll = useRef(0); // где был список книг — туда же вернёмся «назад»
  const focusNext = useRef(null); // клавиатура: что получит фокус после смены шага

  const groups = useMemo(() => TESTAMENTS.map(([id, label]) => ({ id, label, list: module.books.filter((b) => testamentOf(b.id) === id) })).filter((g) => g.list.length), [module]);
  const [tab, setTab] = useState(() => {
    const cur = testamentOf(p.ref.book);
    return groups.some((g) => g.id === cur) ? cur : groups[0]?.id;
  });
  const group = groups.find((g) => g.id === tab) || groups[0];

  // Недавние книги из истории переходов этой колонки; текущая — первой
  const recent = useMemo(() => {
    const ids = [p.ref.book];
    for (let i = (p.history || []).length - 1; i >= 0 && ids.length < 8; i--) {
      const id = p.history[i]?.book;
      if (id && !ids.includes(id)) ids.push(id);
    }
    return ids.map((id) => module.books.find((b) => b.id === id)).filter(Boolean);
  }, [p.history, p.ref.book, module]);

  const bookMode = isBookQuery(query);
  const matches = useMemo(() => (bookMode ? matchBooks(module.books, query) : []), [bookMode, query, module]);
  // Ссылка уже понятна — показываем, куда приведёт Enter
  const refHit = useMemo(() => {
    if (bookMode || !query.trim()) return null;
    const r = parseHumanRef(query);
    const b = r && module.books.find((x) => x.id === r.book);
    if (!b || r.chapter < 1 || r.chapter > b.verses.length) return null;
    const verse = Math.max(1, Math.min(r.verse, b.verses[r.chapter - 1] || 1));
    return { ref: { book: b.id, chapter: r.chapter, verse }, label: `${b.name} ${r.chapter}:${verse}` };
  }, [bookMode, query, module]);

  const body = () => rootRef.current?.closest('.sheet-body');
  // Содержимое въезжает справа (вперёд) или слева (назад) — те же сдвиги, что у вкладок окна
  const slide = (back) => {
    const el = body();
    if (!el) return;
    el.classList.remove('tab-in-l', 'tab-in-r');
    void el.offsetWidth;
    el.classList.add(back ? 'tab-in-l' : 'tab-in-r');
  };

  const go = (ref) => {
    onClose();
    navigate(pane, ref);
  };

  const openBook = (b, e) => {
    if (!book) listScroll.current = body()?.scrollTop || 0;
    focusNext.current = keyboardClick(e) ? 'grid' : null;
    setBook(b.id);
    setChapter(b.verses.length === 1 ? 1 : null); // в книге одна глава — сразу стихи
    setErr('');
    slide(false);
  };
  const openChapter = (n, e) => {
    focusNext.current = keyboardClick(e) ? 'grid' : null;
    setChapter(n);
    slide(false);
  };

  const selBook = book && module.books.find((b) => b.id === book);
  const single = selBook?.verses.length === 1;
  const back = () => {
    focusNext.current = document.activeElement?.closest?.('.sheet') && !document.activeElement.matches('.sheet') ? 'back' : null;
    if (chapter && !single) setChapter(null);
    else {
      setChapter(null);
      setBook(null);
    }
    slide(true);
  };

  // Смена шага: список книг — на прежнее место, главы — к текущей главе; с клавиатуры — фокус в новую сетку
  const prevBook = useRef(null);
  useLayoutEffect(() => {
    const el = body();
    if (!el) return;
    if (!book) {
      el.scrollTop = listScroll.current;
      if (focusNext.current && prevBook.current) rootRef.current.querySelector(`[data-book="${prevBook.current}"]`)?.focus({ preventScroll: true });
    } else {
      el.scrollTop = 0;
      const on = rootRef.current.querySelector('.num-grid .on');
      if (on) {
        const r = on.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        if (r.bottom > box.bottom - 16) el.scrollTop += r.top - box.top - box.height / 2 + r.height / 2;
      }
      if (focusNext.current) (on || rootRef.current.querySelector('.bn-start, .num-grid button'))?.focus({ preventScroll: true });
    }
    focusNext.current = null;
    prevBook.current = book;
  }, [book, chapter]);

  // На компьютере сразу можно печатать «Ин 3:16» (на телефоне клавиатура не выскакивает сама)
  useEffect(() => {
    if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return;
    const id = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 80);
    return () => clearTimeout(id);
  }, []);

  const submit = (e) => {
    e.preventDefault();
    const r = parseHumanRef(query);
    if (!r) {
      // Только название книги («Ин», «бытие») — открываем её главы
      const only = bookMode && (module.books.find((b) => b.id === findBookId(query)) || (matches.length === 1 && matches[0]));
      if (only) return openBook(only, { detail: 0 });
      return setErr(t('Не понял ссылку. Пример: Ин 3:16'));
    }
    const b = module.books.find((x) => x.id === r.book);
    if (!b) return setErr(t('В переводе {module} нет этой книги.', { module: module.name }));
    if (r.chapter > b.verses.length) return setErr(t('В книге «{book}» {n} глав.', { book: b.name, n: b.verses.length }));
    go({ book: r.book, chapter: r.chapter, verse: Math.min(r.verse, b.verses[r.chapter - 1] || 1) });
  };

  const pickTab = (id, focus) => {
    if (id === tab) return;
    const from = groups.findIndex((g) => g.id === tab);
    const to = groups.findIndex((g) => g.id === id);
    setTab(id);
    slide(to < from);
    // Переключатель «прилип» к верху — новый список показываем с начала, а не с середины
    const el = body();
    const panel = panelRef.current;
    if (el && panel) {
      const seg = rootRef.current.querySelector('.bn-seg-wrap');
      const top = el.scrollTop + panel.getBoundingClientRect().top - el.getBoundingClientRect().top - (seg?.offsetHeight || 0) - 4;
      if (el.scrollTop > top) el.scrollTop = Math.max(0, top);
    }
    if (focus) requestAnimationFrame(() => rootRef.current?.querySelector(`#bn-tab-${id}`)?.focus());
  };
  const onTabKey = (e) => {
    const i = groups.findIndex((g) => g.id === tab);
    const n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: groups.length - 1 }[e.key];
    if (n === undefined) return;
    e.preventDefault();
    pickTab(groups[(n + groups.length) % groups.length].id, true);
  };

  const tile = (b) => {
    const on = p.ref.book === b.id;
    return (
      <button key={b.id} type="button" data-book={b.id} className={`book-cell${on ? ' on' : ''}`} aria-current={on ? 'true' : undefined} onClick={(e) => openBook(b, e)} title={b.name}>
        <span className="bc-short">
          {b.short.replace(/\.$/, '')}
          {bookMeta(b.id).dc && <sup className="bc-dc" title={t('Неканоническая книга')}>*</sup>}
        </span>
        <span className="bc-name">{b.name}</span>
      </button>
    );
  };

  const title = selBook ? (chapter && !single ? `${selBook.name} ${chapter}` : selBook.name) : t('Перейти');
  const isPs = book === 'Ps';

  return (
    <BottomSheet title={title} subtitle={selBook ? t(categoryOf(selBook.id).name) : module.title || module.name} onClose={onClose} onBack={book ? back : null} initial={2}>
      <div className="bn" ref={rootRef}>
        {!book && (
          <>
            {/* input-wrap — длинная подсказка гаснет к концу (fadeEnd.js); вид поля задаёт .bn-search */}
            <form className={`ref-form input-wrap bn-search${query ? ' has-q' : ''}`} onSubmit={submit}>
              <label htmlFor="ref-input" className="sr-only">
                {t('Ссылка')}
              </label>
              <Search size={18} className="bn-search-ic" aria-hidden="true" />
              <input
                id="ref-input"
                ref={inputRef}
                value={query}
                onChange={(e) => (setQuery(e.target.value), setErr(''))}
                // Escape в заполненном поле сначала стирает его, второй — закрывает окно
                onKeyDown={(e) => e.key === 'Escape' && query && (e.stopPropagation(), setQuery(''), setErr(''))}
                placeholder={t('Книга или ссылка: Ин 3:16')}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="go"
              />
              {query && (
                <button type="button" className="bn-clear" aria-label={t('Очистить')} onClick={() => (setQuery(''), setErr(''), inputRef.current?.focus())}>
                  <X size={18} />
                </button>
              )}
              <button className="bn-submit" type="submit" aria-label={t('Перейти')}>
                <ArrowRight size={18} />
              </button>
            </form>
            {err && (
              <p className="error-text small" role="alert">
                {err}
              </p>
            )}

            {refHit && (
              <button type="button" className="bn-go" onClick={() => go(refHit.ref)}>
                <CornerDownLeft size={18} aria-hidden="true" />
                <span>{t('Перейти: {ref}', { ref: refHit.label })}</span>
              </button>
            )}

            {bookMode ? (
              matches.length ? (
                <section className="book-cat bn-results">
                  <div className="book-grid">{matches.map(tile)}</div>
                </section>
              ) : (
                <p className="bn-empty" role="status">
                  {t('Ничего не найдено.')}
                </p>
              )
            ) : (
              !query.trim() && (
                <>
                  {recent.length > 0 && (
                    <div className="bn-recent">
                      <h3 className="bn-label" id="bn-recent-h">
                        {t('Недавние')}
                      </h3>
                      <div className="bn-chips" data-no-swipe role="list" aria-labelledby="bn-recent-h">
                        {recent.map((b) => (
                          <div role="listitem" key={b.id}>
                            <button type="button" className={`bn-chip${b.id === p.ref.book ? ' on' : ''}`} aria-current={b.id === p.ref.book ? 'true' : undefined} onClick={(e) => openBook(b, e)}>
                              {b.name}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {groups.length > 1 && (
                    <div className="bn-seg-wrap">
                      <div className="tabs bn-seg" role="tablist" onKeyDown={onTabKey} style={{ '--n': groups.length, '--i': groups.indexOf(group) }}>
                        <span className="bn-seg-pill" aria-hidden="true" />
                        {groups.map((g) => (
                          <button
                            key={g.id}
                            id={`bn-tab-${g.id}`}
                            type="button"
                            role="tab"
                            aria-selected={g.id === group.id}
                            aria-controls="bn-panel"
                            tabIndex={g.id === group.id ? 0 : -1}
                            className={g.id === group.id ? 'on' : ''}
                            onClick={() => pickTab(g.id)}
                          >
                            {t(g.label)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {group && (
                    <div className="bn-panel" id="bn-panel" ref={panelRef} {...(groups.length > 1 ? { role: 'tabpanel', 'aria-labelledby': `bn-tab-${group.id}` } : {})}>
                      {/* Разделы (Пятикнижие, пророки, Евангелия…): у заголовка — точка своего спокойного цвета */}
                      {groupByCategory(group.list).map((cat) => (
                        <section key={cat.id} className="book-cat" style={{ '--c': cat.color }} aria-labelledby={`bn-cat-${cat.id}`}>
                          <h3 className="book-cat-head bn-label" id={`bn-cat-${cat.id}`}>
                            <i aria-hidden="true" />
                            {t(cat.name)}
                          </h3>
                          <div className="book-grid">{cat.list.map(tile)}</div>
                        </section>
                      ))}
                    </div>
                  )}
                </>
              )
            )}
          </>
        )}

        {selBook && !chapter && (
          <div className="num-grid" role="group" aria-label={selBook.name}>
            {selBook.verses.map((_, i) => {
              const n = i + 1;
              const on = p.ref.book === book && p.ref.chapter === n;
              return (
                <button key={n} type="button" className={on ? 'on' : ''} aria-current={on ? 'true' : undefined} aria-label={isPs ? t('Псалом {n}', { n }) : t('Глава {n}', { n })} onClick={(e) => openChapter(n, e)}>
                  {n}
                </button>
              );
            })}
          </div>
        )}

        {selBook && chapter && (
          <>
            <button type="button" className="btn wide bn-start" onClick={() => go({ book, chapter, verse: 1 })}>
              <BookOpen size={19} aria-hidden="true" />
              {t('С начала главы')}
            </button>
            <div className="num-grid" role="group" aria-label={`${selBook.name} ${chapter}`}>
              {Array.from({ length: selBook.verses[chapter - 1] }, (_, i) => {
                const n = i + 1;
                const on = p.ref.book === book && p.ref.chapter === chapter && p.ref.verse === n;
                return (
                  <button key={n} type="button" className={on ? 'on' : ''} aria-current={on ? 'true' : undefined} aria-label={t('Стих {n} из {total}', { n, total: selBook.verses[chapter - 1] })} onClick={() => go({ book, chapter, verse: n })}>
                    {n}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
