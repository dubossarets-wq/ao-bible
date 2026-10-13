// Верхняя панель по образцу мобильного приложения: перевод · разделение · ссылка · поиск · назад · вперёд · меню.
import React, { useEffect, useRef, useState } from 'react';
import { Search, X, MoreVertical, Library, Palette, Bookmark, BookmarkCheck, Star, ListTree, Info, Eye, EyeOff, Columns2, Rows2 } from 'lucide-react';
import { useApp } from '../App.jsx';
import { bookMeta } from '../core/books.js';

// Стрелки «←…» и «→…» как на скриншоте: стрелка с многоточием (история переходов)
function HistoryArrow({ dir }) {
  return (
    <svg width="26" height="22" viewBox="0 0 26 22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {dir < 0 ? (
        <>
          <path d="M20 9H4" />
          <path d="M9 4L4 9l5 5" />
        </>
      ) : (
        <>
          <path d="M3 9h16" />
          <path d="M14 4l5 5-5 5" />
        </>
      )}
      <circle cx={dir < 0 ? 14 : 13} cy="18" r="1" fill="currentColor" stroke="none" />
      <circle cx={dir < 0 ? 18 : 17} cy="18" r="1" fill="currentColor" stroke="none" />
      <circle cx={dir < 0 ? 22 : 21} cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function ReaderToolbar({ index, pane, module }) {
  const app = useApp();
  const { openSheet, go, panes, openSplit, closeSplit, settings, setSettings, isBookmarked, toggleBookmark } = app;
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);
  const split = !!panes[1];
  const ref = pane.ref;
  const label = `${bookMeta(ref.book).short} ${ref.chapter}:${ref.verse}`;

  useEffect(() => {
    if (!menu) return;
    const off = (e) => !menuRef.current?.contains(e.target) && setMenu(false);
    const esc = (e) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('pointerdown', off);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', off);
      document.removeEventListener('keydown', esc);
    };
  }, [menu]);

  const item = (Icon, text, fn, extra) => (
    <button
      role="menuitem"
      className="menu-item"
      onClick={() => {
        setMenu(false);
        fn();
      }}
    >
      <Icon size={18} />
      <span>{text}</span>
      {extra && <span className="menu-extra">{extra}</span>}
    </button>
  );

  return (
    <header className="toolbar">
      <button className="tb tb-module" onClick={() => openSheet('modules', index)} aria-label={`Перевод: ${module?.name}. Сменить перевод`}>
        <span className="tb-module-name">{module?.name || '—'}</span>
      </button>
      <button
        className="tb tb-split"
        onClick={() => (split ? closeSplit() : openSplit())}
        aria-label={split ? 'Закрыть вторую панель' : 'Разделить экран'}
        title={split ? 'Закрыть вторую панель' : 'Разделить экран'}
      >
        {split ? <X size={22} /> : <span className="approx">≈</span>}
      </button>
      <button className="tb tb-ref" onClick={() => openSheet('nav', index)} aria-label={`${bookMeta(ref.book).name} ${ref.chapter}:${ref.verse}. Выбрать место`}>
        {label}
      </button>
      <button className="tb tb-icon" onClick={() => openSheet('search', index)} aria-label="Поиск">
        <Search size={22} />
      </button>
      <button className="tb tb-icon tb-hist" onClick={() => go(index, -1)} disabled={pane.hIndex <= 0} aria-label="Назад по истории">
        <HistoryArrow dir={-1} />
      </button>
      <button className="tb tb-icon tb-hist" onClick={() => go(index, 1)} disabled={pane.hIndex >= pane.history.length - 1} aria-label="Вперёд по истории">
        <HistoryArrow dir={1} />
      </button>
      <div className="tb-menu-wrap" ref={menuRef}>
        <button className="tb tb-icon tb-more" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu} aria-label="Ещё">
          <MoreVertical size={22} />
        </button>
        {menu && (
          <div className="menu" role="menu">
            {item(ListTree, 'Перейти к книге и главе', () => openSheet('nav', index))}
            {item(isBookmarked(ref) ? BookmarkCheck : Bookmark, isBookmarked(ref) ? 'Убрать закладку' : 'Закладка на это место', () => toggleBookmark(ref))}
            {item(Star, 'Закладки, избранное, история', () => openSheet('bookmarks', index))}
            <div className="menu-sep" />
            {item(Library, 'Библиотека модулей', () => openSheet('library', index))}
            {item(Palette, 'Оформление', () => openSheet('settings', index))}
            {item(settings.focusMode ? EyeOff : Eye, 'Режим чтения', () => setSettings({ focusMode: !settings.focusMode }), settings.focusMode ? 'вкл' : 'выкл')}
            {split &&
              item(settings.splitLayout === 'rows' ? Columns2 : Rows2, settings.splitLayout === 'rows' ? 'Панели рядом' : 'Панели друг над другом', () =>
                setSettings({ splitLayout: settings.splitLayout === 'rows' ? 'columns' : 'rows' })
              )}
            <div className="menu-sep" />
            {item(Info, 'О приложении и источниках', () => openSheet('about', index))}
          </div>
        )}
      </div>
    </header>
  );
}
