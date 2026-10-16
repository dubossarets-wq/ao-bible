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
import { t, fmtDateTime } from '../core/i18n.js';

const ORDER = new Map(BOOKS.map((b, i) => [b.id, i]));
const byBible = (a, b) => (ORDER.get(a.book) ?? 999) - (ORDER.get(b.book) ?? 999) || a.chapter - b.chapter || a.verse - b.verse;

// Выделения: фильтр по цвету, текст стиха из перевода панели
function HighlightsTab({ moduleId, open }) {
  const { highlights, setHighlight, hlLabels } = useApp();
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
        {t('Зажмите стих и нажмите маркер, чтобы выделить его цветом.')}
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
          <li key={x.key} className="list-row">
            <button className="list-main stacked" onClick={() => open(x.ref)}>
              <span className="list-title">
                <span className="hl-swatch" style={{ background: HL_COLORS.find((c) => c.id === x.color)?.css }} /> {formatRef(x.ref, { full: true })}
              </span>
              {texts[x.key] && <span className="list-text">{texts[x.key]}</span>}
            </button>
            <button className="icon-btn subtle" aria-label={t('Убрать выделение')} onClick={() => setHighlight([x.ref], null)}>
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

// Подборки: список → стихи подборки
function CollectionsTab({ open }) {
  const { collections, setCollections } = useApp();
  const [cur, setCur] = useState(null);
  const c = collections.find((x) => x.id === cur);
  if (!collections.length)
    return (
      <Empty icon={Folder} title={t('Подборок пока нет')}>
        {t('Зажмите стих → «⋯» → «В подборку…», чтобы собрать стихи к уроку или теме.')}
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
            <li key={`${x.book}.${x.chapter}.${x.verse}`} className="list-row">
              <button className="list-main stacked" onClick={() => open(x)}>
                <span className="list-title">{formatRef(x, { full: true })}</span>
                {x.text && <span className="list-text">{x.text}</span>}
              </button>
              <button
                className="icon-btn subtle"
                aria-label={t('Убрать из подборки')}
                onClick={() => setCollections((cs) => cs.map((y) => (y.id === c.id ? { ...y, items: y.items.filter((i) => i !== x) } : y)))}
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  return (
    <ul className="list">
      {collections.map((x) => (
        <li key={x.id} className="list-row">
          <button className="list-main" onClick={() => setCur(x.id)}>
            <Folder size={16} className="accent" />
            <span className="list-title">{x.name}</span>
            <span className="list-meta">{t('{n} ст.', { n: x.items.length })}</span>
          </button>
          <ConfirmButton className="icon-btn subtle" confirmText={t('Удалить')} onConfirm={() => setCollections((cs) => cs.filter((y) => y.id !== x.id))} aria-label={t('Удалить подборку')}>
            <Trash2 size={16} />
          </ConfirmButton>
        </li>
      ))}
    </ul>
  );
}

const fmtDate = (at) => fmtDateTime(at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function BookmarksManager({ pane, payload, onClose }) {
  const { bookmarks, setBookmarks, favorites, setFavorites, notes, setNote, panes, navigate, go, openSheet, highlights, collections } = useApp();
  const [nq, setNq] = useState('');
  const [tab, setTab] = useState(payload.tab || 'bookmarks');
  const p = panes[pane]?.kind === 'map' ? panes[0] : panes[pane];
  const open = (ref) => {
    onClose();
    navigate(pane, { book: ref.book, chapter: ref.chapter, verse: ref.verse });
  };

  const history = p.history.map((r, i) => ({ r, i })).reverse();
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
                {t('{ref} — последнее место', { ref: `${bookMeta(p.ref.book).name} ${p.ref.chapter}:${p.ref.verse}` })}
              </span>
            </span>
          </button>
          {bookmarks.length ? (
            <ul className="list">
              {bookmarks.map((b) => (
                <li key={`${b.book}.${b.chapter}.${b.verse}.${b.at}`} className="list-row">
                  <button className="list-main stacked" onClick={() => open(b)}>
                    <span className="list-title">
                      <Bookmark size={14} className="accent" /> {formatRef(b, { full: true })}
                      <span className="list-meta">{fmtDate(b.at)}</span>
                    </span>
                    {b.text && <span className="list-text">{b.text}</span>}
                  </button>
                  <button className="icon-btn subtle" aria-label={t('Удалить закладку')} onClick={() => setBookmarks((bs) => bs.filter((x) => x !== b))}>
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={Bookmark} title={t('Закладок пока нет')}>
              {t('Зажмите стих и нажмите «Закладка» — с этого места можно будет продолжить. Закладок может быть сколько угодно.')}
            </Empty>
          )}
        </>
      )}

      {tab === 'favorites' &&
        (favorites.length ? (
          <ul className="list">
            {favorites.map((f) => (
              <li key={`${f.book}.${f.chapter}.${f.verse}`} className="list-row">
                <button className="list-main stacked" onClick={() => open(f)}>
                  <span className="list-title">
                    <Heart size={14} className="love" fill="currentColor" /> {formatRef(f, { full: true })}
                  </span>
                  <span className="list-text">{f.text}</span>
                </button>
                <button className="icon-btn subtle" aria-label={t('Убрать из любимых')} onClick={() => setFavorites((fs) => fs.filter((x) => x !== f))}>
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon={Heart} title={t('Любимых стихов пока нет')}>
            {t('Дважды быстро нажмите на стих — он станет любимым. Или зажмите стих и нажмите сердечко.')}
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
              <li key={`${n.ref.book}.${n.ref.chapter}.${n.ref.verse}`} className="list-row">
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
                <button className="icon-btn subtle" aria-label={t('Удалить заметку')} onClick={() => setNote(n.ref, '')}>
                  <Trash2 size={16} />
                </button>
              </li>
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
