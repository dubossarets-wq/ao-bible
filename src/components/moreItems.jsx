// Пункты меню «Ещё»: одни и те же для выпадающего меню ⋮ (компьютер) и для листа «Ещё» (телефон).
// Каждый пункт: { key, icon, label, sub?, extra?, cls?, keep?, run } — keep: лист не закрывается (переключатели).
import { Bookmark, BookmarkCheck, Heart, Eye, EyeOff, Columns2, Rows2, ScrollText, Settings as SettingsIcon, BookOpenCheck, Palette, Library } from 'lucide-react';
import { RefreshCw, Map as MapIcon, PlayCircle, Link2, Headphones, BookOpenText, CalendarCheck, History, MessageSquareWarning } from 'lucide-react';
import { bookMeta } from '../core/books.js';
import { getVerse } from '../core/modules.js';
import { listenFrom } from '../core/listen.js';
import { plainText } from '../core/verseMarkup.js';
import { IS_STAGING } from '../core/channel.js';
import { IS_PWA_BUILD, applyUpdate } from '../core/updates.js';
import { t } from '../core/i18n.js';
import { problemReportUrl } from '../core/errorLog.js';

// sheet: true — для листа «Ещё» на телефоне: там нет «Планов» и «Закладок, заметок…» (у них свои вкладки)
export function moreItems(app, { index, ref, module, sheet = false }) {
  const { openSheet, panes, settings, setSettings, isBookmarked, toggleBookmark, updates, modules, bookmarks, navigate } = app;
  // Из листа «Ещё» окна открываются с возвратом: крестик ведёт обратно в «Ещё»
  const open = (kind, i, payload) => openSheet(kind, i, sheet ? { ...payload, backTo: 'more' } : payload);
  const m = settings.menu;
  const split = !!panes[1];
  const marked = isBookmarked(ref);
  const last = bookmarks[0];
  const out = [];
  const add = (x) => out.push(x);
  add({
    key: 'bookmark',
    icon: marked ? BookmarkCheck : Bookmark,
    label: marked ? t('Убрать закладку') : t('Закладка на это место'),
    run: async () => {
      const v = marked ? null : await getVerse(module.id, ref);
      toggleBookmark(ref, v ? plainText(v).slice(0, 160) : '');
    },
  });
  // Самая новая закладка — первая в списке
  if (m.lastBookmark && last)
    add({
      key: 'last',
      icon: PlayCircle,
      label: t('К последней закладке'),
      sub: `${bookMeta(last.book).short} ${last.chapter}:${last.verse}${last.text ? ` · ${last.text}` : ''}`,
      run: () => navigate(index, last),
    });
  if (!sheet) add({ key: 'saved', icon: Heart, label: t('Закладки и заметки'), run: () => open('bookmarks', index) });
  if (m.sermons) add({ key: 'sermons', icon: ScrollText, label: t('Проповеди'), run: () => open('sermons', index) });
  if (m.plans && !sheet) add({ key: 'plans', icon: CalendarCheck, label: t('Планы чтения'), run: () => open('plans', index) });
  if (m.listen) add({ key: 'listen', icon: Headphones, label: t('Слушать с этого места'), run: () => listenFrom(index, module.id, ref) });
  if (m.maps && modules.some((x) => x.type === 'maps')) add({ key: 'maps', icon: MapIcon, label: t('Карты'), run: () => open('maps', index) });
  // Переключатели, которые человек сам вынес в меню (Настройки → «Меню ⋮»)
  if (m.focus || m.book || (m.split && split)) add({ key: 'sep1', sep: true });
  const onOff = (v) => (v ? t('вкл') : t('выкл'));
  if (m.focus) add({ key: 'focus', keep: true, icon: settings.focusMode ? EyeOff : Eye, label: t('Режим чтения'), extra: onOff(settings.focusMode), run: () => setSettings({ focusMode: !settings.focusMode }) });
  if (m.book) add({ key: 'book', keep: true, icon: BookOpenText, label: t('Как книга'), extra: onOff(settings.bookMode), run: () => setSettings({ bookMode: !settings.bookMode, continuousVerses: false }) });
  if (m.split && split && panes[1]?.kind !== 'map')
    add({ key: 'sync', keep: true, icon: Link2, label: t('Синхронная прокрутка'), extra: onOff(settings.syncScroll), run: () => setSettings({ syncScroll: !settings.syncScroll }) });
  if (m.split && split) {
    const rows = settings.splitLayout === 'rows';
    add({ key: 'layout', keep: true, icon: rows ? Columns2 : Rows2, label: rows ? t('Панели рядом') : t('Панели друг над другом'), run: () => setSettings({ splitLayout: rows ? 'columns' : 'rows' }) });
  }
  add({ key: 'sep2', sep: true });
  if (IS_PWA_BUILD && updates.available) add({ key: 'update', cls: 'update-item', icon: RefreshCw, label: t('Обновить приложение'), extra: t('новая версия'), extraCls: 'badge-new', run: () => applyUpdate() });
  // Только на тестовом сайте: версии с заметками — что изменилось, обновиться или вернуться
  if (IS_STAGING) add({ key: 'versions', icon: History, label: t('Обновления'), run: () => open('versions', index) }); // о новой версии говорит бейдж у «Обновить приложение»
  add({ key: 'library', icon: Library, label: t('Библиотека модулей'), run: () => open('library', index) }); // модули — сразу из «Ещё»
  add({ key: 'appearance', icon: Palette, label: t('Оформление'), run: () => open('settings', index) });
  add({ key: 'prefs', icon: SettingsIcon, label: t('Настройки'), run: () => open('prefs', index) });
  if (m.help) add({ key: 'help', icon: BookOpenCheck, label: t('Инструкция'), run: () => open('help', index) });
  // Письмо разработчику: версия, устройство и последние ошибки — человек видит текст и отправляет сам
  if (m.help)
    add({
      key: 'report',
      icon: MessageSquareWarning,
      label: t('Сообщить о проблеме'),
      run: () => (location.href = problemReportUrl({ subject: t('AO Bible: проблема'), intro: t('Что случилось и что вы делали перед этим:'), modules: modules.map((x) => x.id) })),
    });
  // Без двух разделителей подряд и без разделителя в конце
  return out.filter((x, i, a) => !x.sep || (i > 0 && i < a.length - 1 && !a[i + 1].sep && !a[i - 1].sep));
}

// Один пункт: в выпадающем меню и в листе «Ещё» выглядит одинаково (класс menu-item)
export function MoreItem({ item, onDone }) {
  if (item.sep) return <div className="menu-sep" />;
  const Icon = item.icon;
  return (
    <button
      role="menuitem"
      className={`menu-item ${item.sub ? 'menu-item-2' : ''} ${item.cls || ''}`}
      data-key={item.key}
      onClick={() => {
        onDone?.(item);
        item.run();
      }}
    >
      <Icon size={18} />
      {item.sub ? (
        <span className="menu-2">
          <span>{item.label}</span>
          <span className="menu-2-sub">{item.sub}</span>
        </span>
      ) : (
        <span>{item.label}</span>
      )}
      {item.extra && <span className={`menu-extra ${item.extraCls || ''}`}>{item.extra}</span>}
    </button>
  );
}
