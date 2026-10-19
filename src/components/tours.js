// Уроки интерактивной инструкции. Шаг: text — что сделать; target() — элемент, который подсвечивается;
// before(api) — подготовить экран при входе в шаг; next(api) — сделать действие за человека по кнопке «Далее»
// (если человек сам нажал на подсвеченное место — считается, что сделал); until() — шаг выполнен сам.
// Тексты помечены N_() и переводятся при показе; нужные кнопки ищутся по переведённым подписям.
// На телефоне (нижняя панель вкладок) часть кнопок в другом месте: поиск, «Планы», «Закладки» — вкладки внизу,
// пункты меню ⋮ — в листе «Ещё». Такие уроки собирают шаги при показе: L(телефон, компьютер).
import {
  BookOpen, MousePointerClick, Highlighter, Link2, Columns2, Search, Heart, ScrollText, CalendarCheck, Headphones, Image as ImageIcon,
  Type, Map as MapIcon, Library, HardDrive, Smartphone, RefreshCw,
} from 'lucide-react';
import { t, N_ } from '../core/i18n.js';
import { isPhoneLayout } from '../core/layout.js';

const P1 = '.pane-slot.first ';
const $ = (s) => document.querySelector(s);
const inView = (el) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.top > 90 && r.bottom < innerHeight - 90;
};
const firstVisible = (sel) => [...document.querySelectorAll(sel)].find(inView) || null;
const byText = (sel, text) => [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(t(text))) || null;
const click = (el) => el?.click();
const verse = () => firstVisible(P1 + '.verse');
const phone = () => isPhoneLayout() && !!$('.tabbar');
const L = (onPhone, onWide) => (phone() ? onPhone : onWide);
const tab = (id) => $(`.tabbar .tab-${id}`);
// Пункт меню ⋮ (компьютер) или листа «Ещё» (телефон)
const menuItem = (text) => () => byText('.menu .menu-item, .sheet .more-list .menu-item', text);
const prefRow = (text) => () => byText('.sheet .pref-row', text);
const menuOpen = () => $('.menu') || $('.sheet .more-list');
const openMenu = () => !menuOpen() && click(phone() ? tab('more') : $(P1 + '.tb-more'));
const menuButton = () => (phone() ? tab('more') : $(P1 + '.tb-more'));
export function selectVerse() {
  const v = verse();
  if (!v || $('.selection-bar')) return;
  const r = v.getBoundingClientRect();
  v.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + 10 }));
}
const openSettings = (api) => api.openSheet('prefs');

export const TOURS = [
  {
    id: 'read', icon: BookOpen, title: N_('Перейти к книге, главе, стиху'), group: N_('Основное'),
    steps: [
      { text: N_('Нажмите — откроется список книг.'), target: () => $(P1 + '.tb-ref'), next: () => click($(P1 + '.tb-ref')) },
      { text: N_('Цвет — это раздел: Пятикнижие, пророки, Евангелия… Выберите книгу, главу и стих.'), target: () => $('.sheet .num-grid') || $('.sheet .book-cat'), before: (api) => !$('.sheet .book-grid') && !$('.sheet .num-grid') && api.openSheet('nav'), until: () => !$('.sheet') },
      { text: N_('Или впишите ссылку, например «Ин 3:16», и нажмите стрелку.'), target: () => $('.sheet .ref-form'), before: (api) => !$('#ref-input') && api.openSheet('nav'), until: () => !$('.sheet') },
      { text: N_('Стрелка «назад» вернёт туда, где вы были.'), target: () => $(P1 + '.tb-hist'), before: (api) => api.closeSheet() },
    ],
  },
  {
    id: 'word', icon: MousePointerClick, title: N_('Значение слова'), group: N_('Основное'),
    steps: [
      { text: N_('Нажмите на любое слово.'), target: () => firstVisible(P1 + '.verse .w'), next: () => click(firstVisible(P1 + '.verse .w')), until: () => $('.word-pop') },
      {
        text: N_('Вот словари с этим словом. Нажмите на любой — откроется статья.'),
        target: () => $('.word-pop') || $('.sheet'),
        before: () => !$('.word-pop') && !$('.sheet') && click(firstVisible(P1 + '.verse .w')),
        next: () => click([...document.querySelectorAll('.word-pop button')].find((b) => !b.textContent.includes(t('Карта')))),
        until: () => $('.sheet') || $('.map-pane'),
      },
      {
        text: N_('Это статья (или карта, если выбрали место). Закрыть — крестик вверху справа.'),
        // Подсказка — у крестика: статья Стронга открывается на весь экран, и рамка на всё окно закрыла бы крестик
        target: () => $(`.sheet [aria-label="${t('Закрыть')}"]`) || $('.map-pane'),
        until: () => !$('.sheet') && !$('.map-pane'),
      },
      { text: N_('Снять выделение — нажмите в любом другом месте.'), target: null, before: (api) => (api.reset(), document.querySelector(`.map-pane [aria-label="${t('Закрыть карту')}"]`)?.click()) },
    ],
  },
  {
    id: 'verse', icon: Highlighter, title: N_('Действия со стихом'), group: N_('Основное'),
    steps: [
      { text: N_('Зажмите стих на полсекунды — он выделится.'), target: verse, next: selectVerse, until: () => $('.selection-bar') },
      { text: N_('Вверху — действия: перевод рядом, комментарии, цвет, заметка, закладка. «⋯» — ещё.'), target: () => $(P1 + '.selection-bar'), before: selectVerse },
      { text: N_('Под стихом — «Слушать» и «В проповедь».'), target: () => $(P1 + '.sel-inline'), before: selectVerse },
      { text: N_('Галочка слева вверху снимает выделение. Нажмите её.'), target: () => $(P1 + '.selection-bar .tb'), until: () => !$('.selection-bar') },
      { text: N_('Совет: дважды коснитесь стиха — он станет любимым (сердечко).'), target: null, before: (api) => api.reset() },
    ],
  },
  {
    id: 'xref', icon: Link2, title: N_('Параллельные места'), group: N_('Основное'),
    steps: [
      { text: N_('Число после стиха — сколько у него параллельных мест. Нажмите на него.'), target: () => firstVisible(P1 + '.xr'), next: () => click(firstVisible(P1 + '.xr')), until: () => $('.sheet') },
      {
        text: N_('Здесь места Библии о том же. Нажмите на любое — оно откроется на второй половине экрана.'),
        target: () => $('.sheet'),
        before: () => !$('.sheet') && click(firstVisible(P1 + '.xr')),
        until: () => !$('.sheet') && $('.pane-slot.second'),
      },
      { text: N_('Место открылось внизу (или справа). Закрыть — крестик вверху.'), target: () => ($('.pane-slot.second') ? $(P1 + '.tb-split') : $('.sheet')), until: () => !$('.pane-slot.second') && !$('.sheet') },
    ],
  },
  {
    id: 'split', icon: Columns2, title: N_('Два перевода рядом'), group: N_('Основное'),
    steps: [
      { text: N_('Эта кнопка делит экран надвое — в каждой части свой перевод. Нажмите её.'), target: () => $(P1 + '.tb-split'), next: () => !$('.pane-slot.second') && click($(P1 + '.tb-split')), until: () => $('.pane-slot.second') },
      { text: N_('Перевод меняется кнопкой с его названием.'), target: () => $('.pane-slot.second .tb-module') || $(P1 + '.tb-module') },
      { text: N_('Крестик на месте той же кнопки закрывает вторую часть.'), target: () => $(P1 + '.tb-split'), until: () => !$('.pane-slot.second') },
    ],
  },
  {
    id: 'search', icon: Search, title: N_('Поиск'), group: N_('Основное'),
    steps: [
      { text: N_('Нажмите на лупу.'), target: () => (phone() ? tab('search') : $(P1 + `[aria-label="${t('Поиск')}"]`)), next: (api) => api.openSheet('search'), until: () => $('.sheet input') },
      { text: N_('Введите слово — места появятся сразу. Или ссылку: «Ин 3:16».'), target: () => $('.sheet input'), before: (api) => !$('.sheet input') && api.openSheet('search') },
    ],
  },
  {
    id: 'saved', icon: Heart, title: N_('Закладки, заметки, любимые'), group: N_('Мои записи'),
    get steps() {
      return [
        { text: L(N_('Откройте «Ещё» — правая кнопка на нижней панели.'), N_('Откройте меню — три точки вверху справа.')), target: menuButton, next: openMenu, until: menuOpen },
        { text: N_('«Закладка на это место» запомнит, где вы читаете. Закладок — сколько угодно.'), target: menuItem('Закладка на это место'), before: openMenu },
        phone()
          ? { text: N_('Все закладки, заметки, любимые стихи и выделения — на вкладке «Закладки» внизу.'), target: () => tab('saved'), before: (api) => api.closeSheet(), next: (api) => api.openSheet('bookmarks', { navTab: 'saved' }) }
          : { text: N_('Здесь все закладки, заметки, любимые стихи и выделения.'), target: menuItem('Закладки и заметки'), before: openMenu, next: (api) => api.openSheet('bookmarks') },
      ];
    },
  },
  {
    id: 'sermons', icon: ScrollText, title: N_('Проповеди'), group: N_('Мои записи'),
    get steps() {
      return [
      { text: N_('Зажмите стих, который понравился.'), target: verse, next: selectVerse, until: () => $('.sel-inline') },
      { text: N_('Нажмите «В проповедь».'), target: () => byText(P1 + '.sel-inline .btn', 'В проповедь'), before: selectVerse, next: () => click(byText(P1 + '.sel-inline .btn', 'В проповедь')), until: () => $('.sheet #sermon-title') },
      {
        text: N_('Впишите название и нажмите «Создать» — или выберите проповедь из списка. Стих добавится сам.'),
        target: () => $('.sheet .sermon-new') || $('.sheet'),
        until: () => $('.sermon-done'),
      },
      { text: N_('Стих добавлен. «Открыть проповедь» — посмотреть её, «Читать дальше» — вернуться к чтению.'), target: () => $('.sheet .sermon-done') || $('.sheet'), until: () => !$('.sermon-done') },
      { text: L(N_('Все проповеди — «Ещё» → «Проповеди».'), N_('Все проповеди — в меню ⋮ → «Проповеди».')), target: menuItem('Проповеди'), before: (api) => (api.reset(), setTimeout(openMenu, 150)), next: (api) => api.openSheet('sermons') },
      { text: N_('«Текст» — своя мысль. Зажмите блок, чтобы перетащить. «Кафедра» — крупный текст для служения.'), target: () => $('.sheet'), before: (api) => !$('.sheet') && api.openSheet('sermons') },
      ];
    },
  },
  {
    id: 'plans', icon: CalendarCheck, title: N_('Планы чтения'), group: N_('Чтение'),
    get steps() {
      return [
      phone()
        ? { text: N_('Нажмите «Планы» на нижней панели.'), target: () => tab('plans'), next: (api) => api.openSheet('plans', { navTab: 'plans' }), until: () => $('.sheet') }
        : { text: N_('Меню ⋮ → «Планы чтения».'), target: menuItem('Планы чтения'), before: openMenu, next: (api) => api.openSheet('plans') },
      { text: N_('Выберите план и нажмите «Начать». Дальше каждый день — «Читать»: всё на одной странице, отметки ставятся сами.'), target: () => $('.sheet'), before: (api) => !$('.sheet') && api.openSheet('plans') },
      ];
    },
  },
  {
    id: 'audio', icon: Headphones, title: N_('Слушать Библию'), group: N_('Чтение'),
    steps: [
      { text: N_('Нажмите на наушники — чтец начнёт с того места, где вы читаете.'), target: () => $(P1 + '.listen-fab'), next: () => click($(P1 + '.listen-fab')), until: () => $('.audio-bar') },
      { text: N_('Пауза, стих назад и вперёд. Стрелка вниз — скачать книгу и слушать без интернета.'), target: () => $('.audio-bar'), before: () => !$('.audio-bar') && click($(P1 + '.listen-fab')) },
      { text: N_('Ползунки — скорость и таймер сна. Крестик закрывает проигрыватель.'), target: () => $('.audio-bar') },
    ],
  },
  {
    id: 'image', icon: ImageIcon, title: N_('Картинка со стихом'), group: N_('Чтение'),
    steps: [
      { text: N_('Зажмите стих.'), target: verse, next: selectVerse, until: () => $('.selection-bar') },
      { text: N_('Нажмите «⋯» — там «Картинка со стихом».'), target: () => $(P1 + '.selection-bar .tb-more'), before: selectVerse, next: () => click($(P1 + '.selection-bar .tb-more')), until: () => $('.menu') },
      { text: N_('Нажмите «Картинка со стихом».'), target: menuItem('Картинка со стихом'), next: () => click(byText('.menu .menu-item', 'Картинка со стихом')) },
      { text: N_('Выберите фон и формат. Двигайте текст пальцем, меняйте размер двумя. «Поделиться» — отправить.'), target: () => $('.sheet') },
    ],
  },
  {
    id: 'font', icon: Type, title: N_('Размер букв и оформление'), group: N_('Настройка'),
    get steps() {
      return [
      { text: N_('Разведите два пальца на тексте — буквы станут крупнее. Сведите — мельче.'), target: () => $(P1 + '.scroller'), before: (api) => api.reset() },
      { text: L(N_('Тема, шрифт и интервалы — «Ещё» → «Оформление».'), N_('Тема, шрифт и интервалы — меню ⋮ → «Оформление».')), target: menuItem('Оформление'), before: openMenu, next: (api) => api.openSheet('settings') },
      ];
    },
  },
  {
    id: 'maps', icon: MapIcon, title: N_('Карты'), group: N_('Настройка'),
    get steps() {
      return [
      { text: N_('Нажмите на название города или места — в списке будет «Карта». Место откроется на второй половине экрана.'), target: verse },
      { text: L(N_('Все карты — «Ещё» → «Карты».'), N_('Все карты — меню ⋮ → «Карты».')), target: menuItem('Карты'), before: openMenu, next: (api) => api.openSheet('maps') },
      ];
    },
  },
  {
    id: 'library', icon: Library, title: N_('Переводы и словари'), group: N_('Настройка'),
    steps: [
      { text: N_('Перевод меняется этой кнопкой.'), target: () => $(P1 + '.tb-module') },
      { text: N_('Новые переводы, словари, комментарии — в Настройках → «Библиотека модулей».'), target: prefRow('Библиотека модулей'), before: openSettings, next: (api) => api.openSheet('library') },
      { text: N_('Во вкладке «Каталог» нажмите стрелку справа от модуля — он скачается.'), target: () => $('.sheet'), before: (api) => !$('.sheet .tabs') && api.openSheet('library') },
    ],
  },
  {
    id: 'data', icon: HardDrive, title: N_('Перенос на другой телефон'), group: N_('Настройка'),
    steps: [
      { text: N_('Настройки → «Мои данные».'), target: prefRow('Мои данные'), before: openSettings, next: () => click(byText('.sheet .pref-row', 'Мои данные')) },
      { text: N_('«Сохранить в файл» — и отправьте в облако или мессенджер. На новом телефоне — «Восстановить из файла».'), target: () => $('.sheet .pref-btns') },
    ],
  },
  {
    id: 'install', icon: Smartphone, title: N_('Значок на экране телефона'), group: N_('Настройка'),
    steps: [
      { text: N_('iPhone: откройте сайт в Safari → кнопка «Поделиться» (квадрат со стрелкой) → «На экран Домой».'), target: null },
      { text: N_('Android: Chrome → меню ⋮ → «Установить приложение». Дальше открывайте со значка.'), target: null },
    ],
  },
  {
    id: 'updates', icon: RefreshCw, title: N_('Обновления'), group: N_('Настройка'),
    steps: [
      { text: N_('Приложение обновляется само — записи и настройки остаются.'), target: null },
      { text: N_('Здесь можно проверить обновления и вернуться к прежней версии.'), target: prefRow('Обновления'), before: openSettings },
    ],
  },
];
