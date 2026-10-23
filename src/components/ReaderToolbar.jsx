// Верхняя панель панели чтения. Состав и порядок кнопок — в TOP_BAR: на телефоне (есть нижняя панель вкладок)
// и на широком экране свой список; переставить кнопки — поменять массив, логика не меняется.
import React, { useEffect, useRef, useState } from 'react';
import { Search, X, MoreVertical, ChevronDown, ArrowLeft, ArrowRight, Columns2 } from 'lucide-react';
import { useApp } from '../App.jsx';
import { bookMeta } from '../core/books.js';
import { useLivePosition, getLivePosition } from '../core/livePosition.js';
import { t } from '../core/i18n.js';
import { shortName } from '../core/moduleShort.js';
import { usePhoneLayout } from '../core/layout.js';
import { swallowNextClick, fitMenu } from './ui.jsx';
import { moreItems, MoreItem } from './moreItems.jsx';

// Кнопки: module — перевод (пилюля), ref — место (пилюля), back/forward — история переходов,
// search — поиск, split — разделить экран, more — меню ⋮. Пустая строка '|' — распорка (дальше — прижато вправо).
export const TOP_BAR = {
  phone: ['module', 'ref', '|', 'back', 'forward', 'split'], // поиск и ⋮ — на нижней панели вкладок (TabBar.jsx)
  wide: ['module', 'ref', '|', 'back', 'forward', 'search', 'split', 'more'],
};

export default function ReaderToolbar({ index, pane, module }) {
  const app = useApp();
  const { openSheet, go, panes, openSplit, closeSplit, updates } = app;
  const phone = usePhoneLayout();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);
  const split = !!panes[1];
  // Место при прокрутке меняется на каждом стихе — его показывает отдельная маленькая кнопка (RefButton),
  // а шапка со всеми значками не перерисовывается
  const ref = getLivePosition(index) || pane.ref;

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

  const buttons = {
    module: () => (
      <button key="module" className="tb tb-module" onClick={() => openSheet('modules', index)} aria-label={t('Перевод: {name}. Сменить перевод', { name: module?.name })}>
        <span className="tb-module-name">{shortName(module)}</span>
        <ChevronDown size={14} className="tb-chev" />
      </button>
    ),
    ref: () => <RefButton key="ref" index={index} pane={pane} onOpen={() => openSheet('nav', index)} />,
    back: () => (
      <button key="back" className="tb tb-icon tb-hist" onClick={() => go(index, -1)} disabled={pane.hIndex <= 0} aria-label={t('Назад по истории')} title={t('Назад')}>
        <ArrowLeft size={21} />
      </button>
    ),
    forward: () =>
      pane.hIndex < pane.history.length - 1 && (
        <button key="forward" className="tb tb-icon tb-hist" onClick={() => go(index, 1)} aria-label={t('Вперёд по истории')} title={t('Вперёд')}>
          <ArrowRight size={21} />
        </button>
      ),
    search: () => (
      <button key="search" className="tb tb-icon tb-search" onClick={() => openSheet('search', index)} aria-label={t('Поиск')} title={t('Поиск')}>
        <Search size={21} />
      </button>
    ),
    split: () => (
      <button
        key="split"
        className={`tb tb-icon tb-split ${split ? 'on' : ''}`}
        onClick={() => (split ? closeSplit() : openSplit())}
        aria-label={split ? t('Закрыть вторую панель') : t('Разделить экран')}
        title={split ? t('Закрыть вторую панель') : t('Разделить экран')}
      >
        {split ? <X size={21} /> : <Columns2 size={21} />}
      </button>
    ),
    more: () => (
      <div key="more" className="tb-menu-wrap" ref={menuRef}>
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
          <div className="menu" role="menu" ref={fitMenu}>
            {moreItems(app, { index, ref, module }).map((it) => (
              <MoreItem key={it.key} item={it} onDone={() => setMenu(false)} />
            ))}
          </div>
        )}
      </div>
    ),
    '|': () => <span key="gap" className="tb-gap" aria-hidden="true" />,
  };

  return <header className={`toolbar topbar ${phone ? 'is-phone' : ''}`}>{TOP_BAR[phone ? 'phone' : 'wide'].map((k) => buttons[k]?.())}</header>;
}

// Кнопка места «Нав. 13:32» — обновляется сама при прокрутке
function RefButton({ index, pane, onOpen }) {
  const ref = useLivePosition(index, pane.ref);
  return (
    <button className="tb tb-ref" onClick={onOpen} aria-label={t('{ref}. Выбрать место', { ref: `${bookMeta(ref.book).name} ${ref.chapter}:${ref.verse}` })}>
      <span className="tb-ref-text">{`${bookMeta(ref.book).short} ${ref.chapter}:${ref.verse}`}</span>
      <ChevronDown size={16} className="tb-chev" />
    </button>
  );
}
