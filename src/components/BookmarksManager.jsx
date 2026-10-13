// Закладки «продолжить отсюда» (сколько угодно), избранные стихи, заметки и история переходов
import React, { useState } from 'react';
import { Bookmark, Star, History, Trash2, NotebookPen, PlayCircle } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { formatRef, parseOsisRef, bookMeta } from '../core/books.js';
import { Empty } from './ui.jsx';

const fmtDate = (t) => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function BookmarksManager({ pane, payload, onClose }) {
  const { bookmarks, setBookmarks, favorites, setFavorites, notes, setNote, panes, navigate, go, openSheet } = useApp();
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

  return (
    <BottomSheet title="Закладки и заметки" onClose={onClose} initial={2}>
      <div className="tabs" role="tablist">
        {[
          ['bookmarks', 'Закладки', bookmarks.length],
          ['favorites', 'Избранное', favorites.length],
          ['notes', 'Заметки', noteList.length],
          ['history', 'История', p.history.length],
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
              <span className="continue-title">Продолжить чтение</span>
              <span className="muted">
                {bookMeta(p.ref.book).name} {p.ref.chapter}:{p.ref.verse} — последнее место
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
                  <button className="icon-btn subtle" aria-label="Удалить закладку" onClick={() => setBookmarks((bs) => bs.filter((x) => x !== b))}>
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={Bookmark} title="Закладок пока нет">
              Зажмите стих и нажмите «Закладка» — с этого места можно будет продолжить. Закладок может быть сколько угодно.
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
                    <Star size={14} className="accent" /> {formatRef(f, { full: true })}
                  </span>
                  <span className="list-text">{f.text}</span>
                </button>
                <button className="icon-btn subtle" aria-label="Убрать из избранного" onClick={() => setFavorites((fs) => fs.filter((x) => x !== f))}>
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon={Star} title="Избранных стихов нет">
            Зажмите стих и нажмите звёздочку.
          </Empty>
        ))}

      {tab === 'notes' &&
        (noteList.length ? (
          <ul className="list">
            {noteList.map((n) => (
              <li key={`${n.ref.book}.${n.ref.chapter}.${n.ref.verse}`} className="list-row">
                <button className="list-main stacked" onClick={() => open(n.ref)}>
                  <span className="list-title">
                    <NotebookPen size={14} className="accent" /> {n.label || formatRef(n.ref, { full: true })}
                    <span className="list-meta">{fmtDate(n.updated || n.at)}</span>
                  </span>
                  <span className="list-text">{n.text}</span>
                </button>
                <button className="icon-btn subtle" aria-label="Изменить заметку" onClick={() => openSheet('note', pane, { refs: [n.ref], moduleId: p.moduleId })}>
                  <NotebookPen size={16} />
                </button>
                <button className="icon-btn subtle" aria-label="Удалить заметку" onClick={() => setNote(n.ref, '')}>
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon={NotebookPen} title="Заметок пока нет">
            Зажмите стих и нажмите «Заметка».
          </Empty>
        ))}

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
                {i === p.hIndex && <span className="list-meta">сейчас</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </BottomSheet>
  );
}
