// Верхняя панель по образцу мобильного приложения: перевод · разделение · ссылка · поиск · назад · вперёд · меню.
import React, { useEffect, useRef, useState } from 'react';
import { Search, X, MoreVertical, ChevronDown, ArrowLeft, ArrowRight, Palette, Bookmark, BookmarkCheck, Heart, Eye, EyeOff, Columns2, Rows2, ScrollText, Settings as SettingsIcon, BookOpenCheck } from 'lucide-react';
import { useApp } from '../App.jsx';
import { bookMeta } from '../core/books.js';
import { getVerse } from '../core/modules.js';
import { listenFrom } from '../core/listen.js';
import { plainText } from '../core/verseMarkup.js';
import { RefreshCw, Map as MapIcon, PlayCircle, Link2, Headphones, BookOpenText, CalendarCheck } from 'lucide-react';
import { IS_PWA_BUILD, applyUpdate } from '../core/updates.js';
import { useLivePosition } from '../core/livePosition.js';

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
  const { openSheet, go, panes, openSplit, closeSplit, settings, setSettings, isBookmarked, toggleBookmark, updates, modules, bookmarks, navigate } = app;
  const m = settings.menu;
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);
  const split = !!panes[1];
  const ref = useLivePosition(index, pane.ref); // мгновенно при прокрутке
  const label = `${bookMeta(ref.book).short} ${ref.chapter}:${ref.verse}`;

  useEffect(() => {
    if (!menu) return;
    const off = (e) => !menuRef.current?.contains(e.target) && !e.target.closest?.('.tour') && setMenu(false);
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
    <header className="toolbar topbar">
      {/* Перевод — «таблетка» слева, место — по центру; действия — круглые кнопки справа */}
      <button className="tb tb-module" onClick={() => openSheet('modules', index)} aria-label={`Перевод: ${module?.name}. Сменить перевод`}>
        <span className="tb-module-name">{module?.name || '—'}</span>
        <ChevronDown size={14} className="tb-chev" />
      </button>
      <button className="tb tb-ref" onClick={() => openSheet('nav', index)} aria-label={`${bookMeta(ref.book).name} ${ref.chapter}:${ref.verse}. Выбрать место`}>
        <span className="tb-ref-text">{label}</span>
        <ChevronDown size={16} className="tb-chev" />
      </button>
      <button className="tb tb-icon tb-hist" onClick={() => go(index, -1)} disabled={pane.hIndex <= 0} aria-label="Назад по истории" title="Назад">
        <ArrowLeft size={21} />
      </button>
      {pane.hIndex < pane.history.length - 1 && (
        <button className="tb tb-icon tb-hist" onClick={() => go(index, 1)} aria-label="Вперёд по истории" title="Вперёд">
          <ArrowRight size={21} />
        </button>
      )}
      <button className="tb tb-icon" onClick={() => openSheet('search', index)} aria-label="Поиск" title="Поиск">
        <Search size={21} />
      </button>
      <button
        className={`tb tb-icon tb-split ${split ? 'on' : ''}`}
        onClick={() => (split ? closeSplit() : openSplit())}
        aria-label={split ? 'Закрыть вторую панель' : 'Разделить экран'}
        title={split ? 'Закрыть вторую панель' : 'Разделить экран'}
      >
        {split ? <X size={21} /> : <Columns2 size={21} />}
      </button>
      <div className="tb-menu-wrap" ref={menuRef}>
        <button
          className="tb tb-icon tb-more"
          onClick={() => setMenu((m) => !m)}
          aria-haspopup="menu"
          aria-expanded={menu}
          aria-label={updates.available ? 'Ещё. Доступно обновление' : 'Ещё'}
        >
          <MoreVertical size={22} />
          {updates.available && <span className="update-dot" aria-hidden="true" />}
        </button>
        {menu && (
          <div className="menu" role="menu">
            {item(isBookmarked(ref) ? BookmarkCheck : Bookmark, isBookmarked(ref) ? 'Убрать закладку' : 'Закладка на это место', async () => {
              const v = isBookmarked(ref) ? null : await getVerse(module.id, ref);
              toggleBookmark(ref, v ? plainText(v).slice(0, 160) : '');
            })}
            {/* Самая новая закладка — первая в списке */}
            {m.lastBookmark && bookmarks.length > 0 && (
              <button
                role="menuitem"
                className="menu-item menu-item-2"
                onClick={() => {
                  setMenu(false);
                  navigate(index, bookmarks[0]);
                }}
              >
                <PlayCircle size={18} />
                <span className="menu-2">
                  <span>К последней закладке</span>
                  <span className="menu-2-sub">
                    {bookMeta(bookmarks[0].book).short} {bookmarks[0].chapter}:{bookmarks[0].verse}
                    {bookmarks[0].text ? ` · ${bookmarks[0].text}` : ''}
                  </span>
                </span>
              </button>
            )}
            {item(Heart, 'Закладки, заметки, любимые стихи', () => openSheet('bookmarks', index))}
            {m.sermons && item(ScrollText, 'Проповеди', () => openSheet('sermons', index))}
            {m.plans && item(CalendarCheck, 'Планы чтения', () => openSheet('plans', index))}
            {m.listen && item(Headphones, 'Слушать с этого места', () => listenFrom(index, module.id, ref))}
            {m.maps && modules.some((x) => x.type === 'maps') && item(MapIcon, 'Карты', () => openSheet('maps', index))}
            {/* Переключатели, которые человек сам вынес в меню (Настройки → «Меню ⋮») */}
            {(m.focus || m.book || (m.split && split)) && <div className="menu-sep" />}
            {m.focus && item(settings.focusMode ? EyeOff : Eye, 'Режим чтения', () => setSettings({ focusMode: !settings.focusMode }), settings.focusMode ? 'вкл' : 'выкл')}
            {m.book && item(BookOpenText, 'Как книга', () => setSettings({ bookMode: !settings.bookMode, continuousVerses: false }), settings.bookMode ? 'вкл' : 'выкл')}
            {m.split &&
              split &&
              panes[1]?.kind !== 'map' &&
              item(Link2, 'Синхронная прокрутка', () => setSettings({ syncScroll: !settings.syncScroll }), settings.syncScroll ? 'вкл' : 'выкл')}
            {m.split &&
              split &&
              item(settings.splitLayout === 'rows' ? Columns2 : Rows2, settings.splitLayout === 'rows' ? 'Панели рядом' : 'Панели друг над другом', () =>
                setSettings({ splitLayout: settings.splitLayout === 'rows' ? 'columns' : 'rows' })
              )}
            <div className="menu-sep" />
            {IS_PWA_BUILD && updates.available && (
              <button role="menuitem" className="menu-item update-item" onClick={() => applyUpdate()}>
                <RefreshCw size={18} />
                <span>Обновить приложение</span>
                <span className="menu-extra badge-new">новая версия</span>
              </button>
            )}
            {item(Palette, 'Оформление', () => openSheet('settings', index))}
            {item(SettingsIcon, 'Настройки', () => openSheet('prefs', index))}
            {m.help && item(BookOpenCheck, 'Инструкция', () => openSheet('help', index))}
          </div>
        )}
      </div>
    </header>
  );
}
