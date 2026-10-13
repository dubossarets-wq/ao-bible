// Закладки, избранные стихи и история переходов
import React, { useState } from 'react';
import { Bookmark, Star, History, Trash2 } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { formatRef } from '../core/books.js';
import { Empty } from './ui.jsx';

const fmtDate = (t) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function BookmarksManager({ pane, payload, onClose }) {
  const { bookmarks, setBookmarks, favorites, setFavorites, panes, navigate, go } = useApp();
  const [tab, setTab] = useState(payload.tab || 'bookmarks');
  const p = panes[pane];
  const open = (ref) => {
    onClose();
    navigate(pane, ref);
  };

  const history = p.history.map((r, i) => ({ r, i })).reverse();

  return (
    <BottomSheet title="Закладки и история" onClose={onClose} initial={2}>
      <div className="tabs" role="tablist">
        {[
          ['bookmarks', 'Закладки', bookmarks.length],
          ['favorites', 'Избранное', favorites.length],
          ['history', 'История', p.history.length],
        ].map(([k, l, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l} <span className="tab-n">{n}</span>
          </button>
        ))}
      </div>

      {tab === 'bookmarks' &&
        (bookmarks.length ? (
          <ul className="list">
            {bookmarks.map((b) => (
              <li key={`${b.book}.${b.chapter}.${b.verse}`} className="list-row">
                <button className="list-main" onClick={() => open(b)}>
                  <Bookmark size={16} className="accent" />
                  <span className="list-title">{formatRef(b, { full: true })}</span>
                  <span className="list-meta">{fmtDate(b.at)}</span>
                </button>
                <button className="icon-btn subtle" aria-label="Удалить закладку" onClick={() => setBookmarks((bs) => bs.filter((x) => x !== b))}>
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon={Bookmark} title="Закладок пока нет">
            Добавьте закладку через меню ⋮ или нажав на номер стиха.
          </Empty>
        ))}

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
            Нажмите на номер стиха и выберите «В избранное».
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
