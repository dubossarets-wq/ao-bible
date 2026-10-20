// Нижняя панель вкладок на телефоне (на экранах от 900 px её нет — там верхняя панель с поиском и меню ⋮).
// Состав и порядок вкладок — в TABS: переставить вкладки — поменять массив, логика не меняется.
// Вкладка «Библия» — экран чтения (закрывает открытое окно); остальные открывают своё окно поверх чтения,
// панель вкладок остаётся видна, активная подсвечена. В режиме чтения панель уходит при прокрутке вниз
// (вместе с верхней), при открытой клавиатуре — прячется.
import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, CalendarCheck, Search, Heart, Menu } from 'lucide-react';
import { useApp } from '../App.jsx';
import { hasSheet } from './SheetHost.jsx';
import { t, N_ } from '../core/i18n.js';

// id — вкладка; sheet — какое окно открыть (null — закрыть окно, экран чтения); payload — что передать окну;
// kinds — какие ещё окна считаются этой вкладкой (для подсветки: открыты из неё)
export const TABS = [
  { id: 'plans', icon: CalendarCheck, label: N_('Планы'), sheet: 'plans' },
  { id: 'search', icon: Search, label: N_('Поиск'), sheet: 'search' },
  { id: 'bible', icon: BookOpen, label: N_('Библия'), sheet: null }, // «Библия» — в центре
  { id: 'saved', icon: Heart, label: N_('Закладки'), sheet: 'bookmarks' },
  { id: 'more', icon: Menu, label: N_('Ещё'), sheet: 'more', kinds: ['prefs', 'settings', 'library', 'about', 'versions', 'news', 'help', 'sermons', 'maps'] },
];

// Какая вкладка сейчас открыта: по тому, из какой вкладки открыто окно, иначе — по виду окна
export function activeTab(sheet) {
  if (!sheet) return 'bible';
  if (sheet.payload?.navTab) return sheet.payload.navTab;
  const tab = TABS.find((x) => x.sheet && (x.sheet === sheet.kind || x.kinds?.includes(sheet.kind)));
  return tab?.id || 'bible';
}

function slideClose(app) {
  const s = app.sheet;
  if (!s) return;
  window.dispatchEvent(new CustomEvent('aob-sheet-slide-close'));
  setTimeout(() => app.closeSheetIf(s.id), 320); // окно без анимации закрытия — закрываем сами
}

export function openTab(app, id) {
  const tab = TABS.find((x) => x.id === id);
  if (!tab) return;
  // «Библия» или повторное нажатие на открытую вкладку — окно плавно уезжает вниз, как и открывалось
  if (!tab.sheet || (app.sheet && activeTab(app.sheet) === id)) return slideClose(app);
  if (!hasSheet(tab.sheet)) return;
  app.openSheet(tab.sheet, 0, { ...(tab.payload || {}), navTab: tab.id });
}

export default function TabBar() {
  const app = useApp();
  const { sheet, updates } = app;
  const active = activeTab(sheet);
  // Подсветка — одна плашка, которая переезжает к выбранному пункту. Пальцем можно вести по меню:
  // плашка идёт за пальцем, отпустили — открывается этот раздел
  const navRef = useRef(null);
  const swipe = useRef(null);
  const [hover, setHover] = useState(null);
  const at = (x) => {
    const r = navRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(TABS.length - 1, Math.floor(((x - r.left - 6) / (r.width - 12)) * TABS.length)));
  };
  const onDown = (e) => {
    swipe.current = { x: e.clientX, moved: false };
  };
  const onMove = (e) => {
    const s = swipe.current;
    if (!s) return;
    if (!s.moved && Math.abs(e.clientX - s.x) > 10) {
      s.moved = true;
      navRef.current.setPointerCapture?.(e.pointerId);
    }
    if (s.moved) setHover(at(e.clientX));
  };
  const onUp = (e) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s?.moved) return setHover(null);
    const id = TABS[at(e.clientX)].id;
    setHover(null);
    s.done = true;
    if (id !== active) openTab(app, id); // провели пальцем до своей же вкладки — ничего не закрываем
    navRef.current.dataset.swiped = '1'; // за свайпом браузер пришлёт click — его пропускаем
    setTimeout(() => navRef.current && delete navRef.current.dataset.swiped, 50);
  };
  const shown = hover ?? TABS.findIndex((x) => x.id === active);

  // Пока панель на экране, раскладка учитывает её высоту (окна, проигрыватель, уведомления — над ней)
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('has-tabbar');
    return () => root.classList.remove('has-tabbar');
  }, []);

  return (
    <nav
      ref={navRef}
      className={`tabbar ${hover != null ? 'swiping' : ''}`}
      aria-label={t('Разделы приложения')}
      style={{ '--tab-i': shown, '--tab-n': TABS.length }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => ((swipe.current = null), setHover(null))}
    >
      <span className="tab-pill" aria-hidden="true" />
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const on = tab.id === active;
        return (
          <button
            key={tab.id}
            className={`tab tab-${tab.id} ${on ? 'on' : ''}`}
            aria-current={on ? 'page' : undefined}
            aria-label={tab.id === 'more' && updates.available ? t('Ещё. Доступно обновление') : undefined}
            onClick={() => !navRef.current?.dataset.swiped && openTab(app, tab.id)}
          >
            <span className="tab-icon">
              <Icon size={22} strokeWidth={on ? 2.4 : 1.9} />
              {tab.id === 'more' && updates.available && <span className="update-dot" aria-hidden="true" />}
            </span>
            <span className="tab-label">{t(tab.label)}</span>
          </button>
        );
      })}
    </nav>
  );
}
