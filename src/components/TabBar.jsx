// Нижняя панель вкладок на телефоне (на экранах от 900 px её нет — там верхняя панель с поиском и меню ⋮).
// Состав и порядок вкладок — в TABS: переставить вкладки — поменять массив, логика не меняется.
// Вкладка «Библия» — экран чтения (закрывает открытое окно); остальные открывают своё окно поверх чтения,
// панель вкладок остаётся видна, активная подсвечена. В режиме чтения панель уходит при прокрутке вниз
// (вместе с верхней), при открытой клавиатуре — прячется.
import React, { useEffect } from 'react';
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

  // Пока панель на экране, раскладка учитывает её высоту (окна, проигрыватель, уведомления — над ней)
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('has-tabbar');
    return () => root.classList.remove('has-tabbar');
  }, []);

  return (
    <nav className="tabbar" aria-label={t('Разделы приложения')}>
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const on = tab.id === active;
        return (
          <button
            key={tab.id}
            className={`tab tab-${tab.id} ${on ? 'on' : ''}`}
            aria-current={on ? 'page' : undefined}
            aria-label={tab.id === 'more' && updates.available ? t('Ещё. Доступно обновление') : undefined}
            onClick={() => openTab(app, tab.id)}
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
