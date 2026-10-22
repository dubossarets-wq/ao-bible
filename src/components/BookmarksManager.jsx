// Закладки «продолжить отсюда» (сколько угодно), любимые стихи, заметки и история переходов
import React, { useEffect, useState } from 'react';
import { Bookmark, Heart, History, Trash2, NotebookPen, PlayCircle, Highlighter, Folder, ChevronLeft, Search } from 'lucide-react';
import { HL_COLORS, hlLabel } from '../core/highlights.js';
import { getVerse } from '../core/modules.js';
import { plainText } from '../core/verseMarkup.js';
import { BOOKS } from '../core/books.js';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { formatRef, parseOsisRef, bookMeta } from '../core/books.js';
import { Empty, ConfirmButton } from './ui.jsx';
import SwipeRow from './SwipeRow.jsx';
import { t, fmtDateTime } from '../core/i18n.js';

const ORDER = new Map(BOOKS.map((b, i) => [b.id, i]));
// «Отменить»: вернуть элемент на прежнее место списка (если его там уже нет)
const putBack = (list, i, x, same = (a) => a === x) => (list.some(same) ? list : [...list.slice(0, i), x, ...list.slice(i)]);
const byBible = (a, b) => (ORDER.get(a.book) ?? 999) - (ORDER.get(b.book) ?? 999) || a.chapter - b.chapter || a.verse - b.verse;

// Выделения: фильтр по цвету, текст стиха из перевода панели
function HighlightsTab({ moduleId, open }) {
  const { highlights, setHighlight, hlLabels, undoToast } = useApp();
  const unmark = (x) => {
    setHighlight([x.ref], null);
    undoToast(t('Выделение убрано'), () => setHighlight([x.ref], x.color));
  };
  const [color, setColor] = useState('all');
  const [texts, setTexts] = useState({});
  const list = Object.entries(highlights)
    .map(([k, c]) => ({ ref: parseOsisRef(k), key: k, color: c }))
    .filter((x) => x.ref && (color === 'all' || x.color === color))
    .sort((a, b) => byBible(a.ref, b.ref));
  useEffect(() => {
    let alive = true;
    Promise.all(list.slice(0, 200).map(async (x) => [x.key, plainText((await getVerse(moduleId, x.ref)) || '')])).then((pairs) => alive && setTexts(Object.fromEntries(pairs)));
    return () => {
      alive = false;
    };
  }, [Object.keys(highlights).length, color, moduleId]);
  if (!Object.keys(highlights).length)
    return (
      <Empty icon={Highlighter} title={t('Выделений пока нет')}>
        {t('Зажмите стих и нажмите маркер.')}
      </Empty>
    );
  const counts = {};
  Object.values(highlights).forEach((c) => (counts[c] = (counts[c] || 0) + 1));
  return (
    <>
      <div className="chips filter-chips" role="group" aria-label={t('Цвет')}>
        <button className={`chip ${color === 'all' ? 'on' : ''}`} onClick={() => setColor('all')}>
          {t('Все')}
        </button>
        {HL_COLORS.filter((c) => counts[c.id]).map((c) => (
          <button key={c.id} className={`chip ${color === c.id ? 'on' : ''}`} onClick={() => setColor(c.id)}>
            <span className="hl-swatch" style={{ background: c.css }} /> {hlLabel(c.id, hlLabels)} <span className="tab-n">{counts[c.id]}</span>
          </button>
        ))}
      </div>
      <ul className="list">
        {list.map((x) => (
          <SwipeRow key={x.key} innerClassName="list-row" onDelete={() => unmark(x)} label={t('Убрать выделение')} actionText={t('Убрать')}>
            <button className="list-main stacked" onClick={() => open(x.ref)}>
              <span className="list-title">
                <span className="hl-swatch" style={{ background: HL_COLORS.find((c) => c.id === x.color)?.css }} /> {formatRef(x.ref, { full: true })}
              </span>
              {texts[x.key] && <span className="list-text">{texts[x.key]}</span>}
            </button>
            <button className="icon-btn subtle" aria-label={t('Убрать выделение')} onClick={() => unmark(x)}>
              <Trash2 size={16} />
            </button>
          </SwipeRow>
        ))}
      </ul>
    </>
  );
}

// Подборки: список → стихи подборки
function CollectionsTab({ open }) {
  const { collections, setCollections, undoToast } = useApp();
  const [cur, setCur] = useState(null);
  const c = collections.find((x) => x.id === cur);
  const dropItem = (c, x) => {
    const i = c.items.indexOf(x);
    setCollections((cs) => cs.map((y) => (y.id === c.id ? { ...y, items: y.items.filter((it) => it !== x) } : y)));
    undoToast(t('Убрано из подборки'), () => setCollections((cs) => cs.map((y) => (y.id === c.id ? { ...y, items: putBack(y.items, i, x) } : y))));
  };
  const dropCollection = (x) => {
    const i = collections.indexOf(x);
    setCollections((cs) => cs.filter((y) => y.id !== x.id));
    undoToast(t('Подборка «{name}» удалена', { name: x.name }), () => setCollections((cs) => putBack(cs, i, x, (y) => y.id === x.id)));
  };
  if (!collections.length)
    return (
      <Empty icon={Folder} title={t('Подборок пока нет')}>
        {t('Зажмите стих → «⋯» → «В подборку…».')}
      </Empty>
    );
  if (c)
    return (
      <>
        <button className="btn small" onClick={() => setCur(null)}>
          <ChevronLeft size={14} /> {t('Все подборки')}
        </button>
        <h4 className="sheet-h4">
          {c.name} · {c.items.length}
        </h4>
        <ul className="list">
          {[...c.items].sort(byBible).map((x) => (
            <SwipeRow key={`${x.book}.${x.chapter}.${x.verse}`} innerClassName="list-row" onDelete={() => dropItem(c, x)} label={t('Убрать из подборки')} actionText={t('Убрать')}>
              <button className="list-main stacked" onClick={() => open(x)}>
                <span className="list-title">{formatRef(x, { full: true })}</span>
                {x.text && <span className="list-text">{x.text}</span>}
              </button>
              <button className="icon-btn subtle" aria-label={t('Убрать из подборки')} onClick={() => dropItem(c, x)}>
                <Trash2 size={16} />
              </button>
            </SwipeRow>
          ))}
        </ul>
      </>
    );
  return (
    <ul className="list">
      {collections.map((x) => (
        <SwipeRow key={x.id} innerClassName="list-row" onDelete={() => dropCollection(x)} label={t('Удалить подборку')}>
          <button className="list-main" onClick={() => setCur(x.id)}>
            <Folder size={16} className="accent" />
            <span className="list-title">{x.name}</span>
            <span className="list-meta">{t('{n} ст.', { n: x.items.length })}</span>
          </button>
          <ConfirmButton className="icon-btn subtle" confirmText={t('Удалить')} onConfirm={() => setCollections((cs) => cs.filter((y) => y.id !== x.id))} aria-label={t('Удалить подборку')}>
            <Trash2 size={16} />
          </ConfirmButton>
        </SwipeRow>
      ))}
    </ul>
  );
}

const fmtDate = (at) => fmtDateTime(at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function BookmarksManager({ pane, payload, onClose }) {
  const { bookmarks, setBookmarks, favorites, setFavorites, notes, setNote, setNotes, panes, navigate, go, openSheet, highlights, collections, undoToast } = useApp();
  const [nq, setNq] = useState('');
  const [tab, setTab] = useState(payload.tab || 'bookmarks');
  const p = panes[pane]?.kind === 'map' ? panes[0] : panes[pane];
  const open = (ref) => {
    onClose();
    navigate(pane, { book: ref.book, chapter: ref.chapter, verse: ref.verse });
  };

  const history = p.history.map((r, i) => ({ r, i })).reverse();
  // Удаление (кнопкой или смахиванием) — сразу, с «Отменить» в уведомлении
  const dropBookmark = (b) => {
    const i = bookmarks.indexOf(b);
    setBookmarks((bs) => bs.filter((x) => x !== b));
    undoToast(t('Закладка удалена'), () => setBookmarks((bs) => putBack(bs, i, b)));
  };
  const dropFavorite = (f) => {
    const i = favorites.indexOf(f);
    setFavorites((fs) => fs.filter((x) => x !== f));
    undoToast(t('Убрано из любимых стихов'), () => setFavorites((fs) => putBack(fs, i, f, (x) => x.book === f.book && x.chapter === f.chapter && x.verse === f.verse)));
  };
  const dropNote = (n) => {
    const key = `${n.ref.book}.${n.ref.chapter}.${n.ref.verse}`;
    const saved = notes[key];
    setNote(n.ref, '');
    undoToast(t('Заметка удалена'), () => setNotes((ns) => (ns[key] ? ns : { ...ns, [key]: saved })));
  };
  const noteList = Object.entries(notes)
    .map(([k, n]) => ({ ref: parseOsisRef(k), ...n }))
    .filter((n) => n.ref)
    .sort((a, b) => (b.updated || b.at) - (a.updated || a.at));
  // Поиск по заметкам — по тексту и по месту
  const nqs = nq.trim().toLowerCase().replace(/ё/g, 'е');
  const notesShown = nqs ? noteList.filter((n) => `${n.text} ${n.label} ${formatRef(n.ref, { full: true })}`.toLowerCase().replace(/ё/g, 'е').includes(nqs)) : noteList;

  return (
    <BottomSheet title={t('Закладки и заметки')} onClose={onClose} initial={2}>
      <div className="tabs" role="tablist">
        {[
          ['bookmarks', t('Закладки'), bookmarks.length],
          ['favorites', t('Любимые стихи'), favorites.length],
          ['notes', t('Заметки'), noteList.length],
          ['highlights', t('Выделения'), Object.keys(highlights).length],
          ['collections', t('Подборки'), collections.length],
          ['history', t('История'), p.history.length],
        ].map(([k, l, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l} <span className="tab-n">{n}</span>
          </button>
        ))}
      </div>

      {tab === 'bookmarks' && (
        <>
          <button className="continue-card" onClick={() => open(p.ref)}>
            <PlayCircle size={26} className="accent" />
            <span className="continue-text">
              <span className="continue-title">{t('Продолжить чтение')}</span>
              <span className="muted">
                {`${bookMeta(p.ref.book).name} ${p.ref.chapter}:${p.ref.verse}`}
              </span>
            </span>
          </button>
          {bookmarks.length ? (
            <ul className="list">
              {bookmarks.map((b) => (
                <SwipeRow key={`${b.book}.${b.chapter}.${b.verse}.${b.at}`} innerClassName="list-row" onDelete={() => dropBookmark(b)} label={t('Удалить закладку')}>
                  <button className="list-main stacked" onClick={() => open(b)}>
                    <span className="list-title">
                      <Bookmark size={14} className="accent" /> {formatRef(b, { full: true })}
                      <span className="list-meta">{fmtDate(b.at)}</span>
                    </span>
                    {b.text && <span className="list-text">{b.text}</span>}
                  </button>
                  <button className="icon-btn subtle" aria-label={t('Удалить закладку')} onClick={() => dropBookmark(b)}>
                    <Trash2 size={16} />
                  </button>
                </SwipeRow>
              ))}
            </ul>
          ) : (
            <Empty icon={Bookmark} title={t('Закладок пока нет')}>
              {t('Зажмите стих и нажмите «Закладка».')}
            </Empty>
          )}
        </>
      )}

      {tab === 'favorites' &&
        (favorites.length ? (
          <ul className="list">
            {favorites.map((f) => (
              <SwipeRow key={`${f.book}.${f.chapter}.${f.verse}`} innerClassName="list-row" onDelete={() => dropFavorite(f)} label={t('Убрать из любимых')} actionText={t('Убрать')}>
                <button className="list-main stacked" onClick={() => open(f)}>
                  <span className="list-title">
                    <Heart size={14} className="love" fill="currentColor" /> {formatRef(f, { full: true })}
                  </span>
                  <span className="list-text">{f.text}</span>
                </button>
                <button className="icon-btn subtle" aria-label={t('Убрать из любимых')} onClick={() => dropFavorite(f)}>
                  <Trash2 size={16} />
                </button>
              </SwipeRow>
            ))}
          </ul>
        ) : (
          <Empty icon={Heart} title={t('Любимых стихов пока нет')}>
            {t('Дважды нажмите на стих — он станет любимым.')}
          </Empty>
        ))}

      {tab === 'notes' && noteList.length > 3 && (
        <div className="input-wrap">
          <Search size={18} className="input-icon" />
          <label htmlFor="notes-q" className="sr-only">
            {t('Поиск по заметкам')}
          </label>
          <input id="notes-q" type="search" value={nq} onChange={(e) => setNq(e.target.value)} placeholder={t('Поиск по заметкам')} autoComplete="off" />
        </div>
      )}
      {tab === 'notes' &&
        (noteList.length ? (
          <ul className="list">
            {notesShown.map((n) => (
              <SwipeRow key={`${n.ref.book}.${n.ref.chapter}.${n.ref.verse}`} innerClassName="list-row" onDelete={() => dropNote(n)} label={t('Удалить заметку')}>
                <button className="list-main stacked" onClick={() => open(n.ref)}>
                  <span className="list-title">
                    <NotebookPen size={14} className="accent" /> {n.label || formatRef(n.ref, { full: true })}
                    <span className="list-meta">{fmtDate(n.updated || n.at)}</span>
                  </span>
                  <span className="list-text">{n.text}</span>
                </button>
                <button className="icon-btn subtle" aria-label={t('Изменить заметку')} onClick={() => openSheet('note', pane, { refs: [n.ref], moduleId: p.moduleId })}>
                  <NotebookPen size={16} />
                </button>
                <button className="icon-btn subtle" aria-label={t('Удалить заметку')} onClick={() => dropNote(n)}>
                  <Trash2 size={16} />
                </button>
              </SwipeRow>
            ))}
          </ul>
        ) : (
          <Empty icon={NotebookPen} title={t('Заметок пока нет')}>
            {t('Зажмите стих и нажмите «Заметка».')}
          </Empty>
        ))}

      {tab === 'highlights' && <HighlightsTab moduleId={p.moduleId} open={open} />}
      {tab === 'collections' && <CollectionsTab open={open} />}

      {tab === 'history' && (
        <ul className="list">
          {history.map(({ r, i }) => (
            <li key={i} className="list-row">
              <button
                className={`list-main ${i === p.hIndex ? 'current' : ''}`}
                onClick={() => {
                  onClose();
                  go(pane, i - p.hIndex);
                }}
              >
                <History size={16} />
                <span className="list-title">{formatRef(r, { full: true })}</span>
                {i === p.hIndex && <span className="list-meta">{t('сейчас')}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </BottomSheet>
  );
}
