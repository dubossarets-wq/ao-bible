// Верхняя панель по образцу мобильного приложения: перевод · разделение · ссылка · поиск · назад · вперёд · меню.
import React, { useEffect, useRef, useState } from 'react';
import { Search, X, MoreVertical, ChevronDown, ArrowLeft, ArrowRight, Palette, Bookmark, BookmarkCheck, Heart, Eye, EyeOff, Columns2, Rows2, ScrollText, Settings as SettingsIcon, BookOpenCheck } from 'lucide-react';
import { useApp } from '../App.jsx';
import { bookMeta } from '../core/books.js';
import { getVerse } from '../core/modules.js';
import { listenFrom } from '../core/listen.js';
import { plainText } from '../core/verseMarkup.js';
import { RefreshCw, Map as MapIcon, PlayCircle, Link2, Headphones, BookOpenText, CalendarCheck, History } from 'lucide-react';
import { IS_STAGING } from '../core/channel.js';
import { IS_PWA_BUILD, applyUpdate } from '../core/updates.js';
import { useLivePosition } from '../core/livePosition.js';
import { t } from '../core/i18n.js';
import { shortName } from '../core/moduleShort.js';
import { swallowNextClick } from './ui.jsx';

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
    const off = (e) => {
      if (menuRef.current?.contains(e.target) || e.target.closest?.('.tour')) return;
      setMenu(false);
      swallowNextClick(); // нажатие мимо меню только закрывает его
    };
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
      <button className="tb tb-module" onClick={() => openSheet('modules', index)} aria-label={t('Перевод: {name}. Сменить перевод', { name: module?.name })}>
        <span className="tb-module-name">{shortName(module)}</span>
        <ChevronDown size={14} className="tb-chev" />
      </button>
      <button className="tb tb-ref" onClick={() => openSheet('nav', index)} aria-label={t('{ref}. Выбрать место', { ref: `${bookMeta(ref.book).name} ${ref.chapter}:${ref.verse}` })}>
        <span className="tb-ref-text">{label}</span>
        <ChevronDown size={16} className="tb-chev" />
      </button>
      <button className="tb tb-icon tb-hist" onClick={() => go(index, -1)} disabled={pane.hIndex <= 0} aria-label={t('Назад по истории')} title={t('Назад')}>
        <ArrowLeft size={21} />
      </button>
      {pane.hIndex < pane.history.length - 1 && (
        <button className="tb tb-icon tb-hist" onClick={() => go(index, 1)} aria-label={t('Вперёд по истории')} title={t('Вперёд')}>
          <ArrowRight size={21} />
        </button>
      )}
      <button className="tb tb-icon" onClick={() => openSheet('search', index)} aria-label={t('Поиск')} title={t('Поиск')}>
        <Search size={21} />
      </button>
      <button
        className={`tb tb-icon tb-split ${split ? 'on' : ''}`}
        onClick={() => (split ? closeSplit() : openSplit())}
        aria-label={split ? t('Закрыть вторую панель') : t('Разделить экран')}
        title={split ? t('Закрыть вторую панель') : t('Разделить экран')}
      >
        {split ? <X size={21} /> : <Columns2 size={21} />}
      </button>
      <div className="tb-menu-wrap" ref={menuRef}>
        <button
          className="tb tb-icon tb-more"
          onClick={() => setMenu((m) => !m)}
          aria-haspopup="menu"
          aria-expanded={menu}
          aria-label={updates.available ? t('Ещё. Доступно обновление') : t('Ещё')}
        >
          <MoreVertical size={22} />
          {updates.available && <span className="update-dot" aria-hidden="true" />}
        </button>
        {menu && (
          <div className="menu" role="menu">
            {item(isBookmarked(ref) ? BookmarkCheck : Bookmark, isBookmarked(ref) ? t('Убрать закладку') : t('Закладка на это место'), async () => {
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
                  <span>{t('К последней закладке')}</span>
                  <span className="menu-2-sub">
                    {bookMeta(bookmarks[0].book).short} {bookmarks[0].chapter}:{bookmarks[0].verse}
                    {bookmarks[0].text ? ` · ${bookmarks[0].text}` : ''}
                  </span>
                </span>
              </button>
            )}
            {item(Heart, t('Закладки, заметки, любимые стихи'), () => openSheet('bookmarks', index))}
            {m.sermons && item(ScrollText, t('Проповеди'), () => openSheet('sermons', index))}
            {m.plans && item(CalendarCheck, t('Планы чтения'), () => openSheet('plans', index))}
            {m.listen && item(Headphones, t('Слушать с этого места'), () => listenFrom(index, module.id, ref))}
            {m.maps && modules.some((x) => x.type === 'maps') && item(MapIcon, t('Карты'), () => openSheet('maps', index))}
            {/* Переключатели, которые человек сам вынес в меню (Настройки → «Меню ⋮») */}
            {(m.focus || m.book || (m.split && split)) && <div className="menu-sep" />}
            {m.focus && item(settings.focusMode ? EyeOff : Eye, t('Режим чтения'), () => setSettings({ focusMode: !settings.focusMode }), settings.focusMode ? t('вкл') : t('выкл'))}
            {m.book && item(BookOpenText, t('Как книга'), () => setSettings({ bookMode: !settings.bookMode, continuousVerses: false }), settings.bookMode ? t('вкл') : t('выкл'))}
            {m.split &&
              split &&
              panes[1]?.kind !== 'map' &&
              item(Link2, t('Синхронная прокрутка'), () => setSettings({ syncScroll: !settings.syncScroll }), settings.syncScroll ? t('вкл') : t('выкл'))}
            {m.split &&
              split &&
              item(settings.splitLayout === 'rows' ? Columns2 : Rows2, settings.splitLayout === 'rows' ? t('Панели рядом') : t('Панели друг над другом'), () =>
                setSettings({ splitLayout: settings.splitLayout === 'rows' ? 'columns' : 'rows' })
              )}
            <div className="menu-sep" />
            {IS_PWA_BUILD && updates.available && (
              <button role="menuitem" className="menu-item update-item" onClick={() => applyUpdate()}>
                <RefreshCw size={18} />
                <span>{t('Обновить приложение')}</span>
                <span className="menu-extra badge-new">{t('новая версия')}</span>
              </button>
            )}
            {/* Только на тестовом сайте: версии с заметками — что изменилось, обновиться или вернуться */}
            {IS_STAGING && item(History, t('Обновления'), () => openSheet('versions', index), updates.available ? t('есть новая') : null)}
            {item(Palette, t('Оформление'), () => openSheet('settings', index))}
            {item(SettingsIcon, t('Настройки'), () => openSheet('prefs', index))}
            {m.help && item(BookOpenCheck, t('Инструкция'), () => openSheet('help', index))}
          </div>
        )}
      </div>
    </header>
  );
}
