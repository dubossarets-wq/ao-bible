// Уроки интерактивной инструкции. Шаг: text — что сделать; target() — элемент, который подсвечивается;
// before(api) — подготовить экран при входе в шаг; next(api) — сделать действие за человека по кнопке «Далее»
// (если человек сам нажал на подсвеченное место — считается, что сделал); until() — шаг выполнен сам.
import {
  BookOpen, MousePointerClick, Highlighter, Link2, Columns2, Search, Heart, ScrollText, CalendarCheck, Headphones, Image as ImageIcon,
  Type, Map as MapIcon, Library, HardDrive, Smartphone, RefreshCw,
} from 'lucide-react';

const P1 = '.pane-slot.first ';
const $ = (s) => document.querySelector(s);
const inView = (el) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.top > 90 && r.bottom < innerHeight - 90;
};
const firstVisible = (sel) => [...document.querySelectorAll(sel)].find(inView) || null;
const byText = (sel, t) => [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(t)) || null;
const click = (el) => el?.click();
const verse = () => firstVisible(P1 + '.verse');
const menuItem = (t) => () => byText('.menu .menu-item', t);
const prefRow = (t) => () => byText('.sheet .pref-row', t);
const openMenu = () => !$('.menu') && click($(P1 + '.tb-more'));
export function selectVerse() {
  const v = verse();
  if (!v || $('.selection-bar')) return;
  const r = v.getBoundingClientRect();
  v.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + 10 }));
}
const openSettings = (api) => api.openSheet('prefs');

export const TOURS = [
  {
    id: 'read', icon: BookOpen, title: 'Перейти к книге, главе, стиху', group: 'Основное',
    steps: [
      { text: 'Нажмите сюда — откроется список книг Библии.', target: () => $(P1 + '.tb-ref'), next: () => click($(P1 + '.tb-ref')) },
      { text: 'Книги разделены по цветам: Пятикнижие, пророки, Евангелия… Нажмите на книгу, потом на главу и стих.', target: () => $('.sheet .num-grid') || $('.sheet .book-cat'), before: (api) => !$('.sheet .book-grid') && !$('.sheet .num-grid') && api.openSheet('nav'), until: () => !$('.sheet') },
      { text: 'Или впишите ссылку сюда, например «Ин 3:16», и нажмите стрелку.', target: () => $('.sheet .ref-form'), before: (api) => !$('#ref-input') && api.openSheet('nav'), until: () => !$('.sheet') },
      { text: 'Стрелка «назад» возвращает к месту, где вы были до перехода.', target: () => $(P1 + '.tb-hist'), before: (api) => api.closeSheet() },
    ],
  },
  {
    id: 'word', icon: MousePointerClick, title: 'Значение слова', group: 'Основное',
    steps: [
      { text: 'Нажмите на любое слово в тексте.', target: () => firstVisible(P1 + '.verse .w'), next: () => click(firstVisible(P1 + '.verse .w')), until: () => $('.word-pop') },
      {
        text: 'Появились словари с этим словом. Нажмите на словарь — откроется статья.',
        target: () => $('.word-pop') || $('.sheet'),
        before: () => !$('.word-pop') && !$('.sheet') && click(firstVisible(P1 + '.verse .w')),
        next: () => click([...document.querySelectorAll('.word-pop button')].find((b) => !b.textContent.includes('Карта'))),
        until: () => $('.sheet') || $('.map-pane'),
      },
      {
        text: 'Это статья словаря (или карта, если выбрали место). Закрыть — крестиком вверху справа.',
        // Подсказка — у крестика: статья Стронга открывается на весь экран, и рамка на всё окно закрыла бы крестик
        target: () => $('.sheet [aria-label="Закрыть"]') || $('.map-pane'),
        until: () => !$('.sheet') && !$('.map-pane'),
      },
      { text: 'Чтобы снять выделение слова, нажмите в любое другое место.', target: null, before: (api) => (api.reset(), document.querySelector('.map-pane [aria-label*="Закрыть"]')?.click()) },
    ],
  },
  {
    id: 'verse', icon: Highlighter, title: 'Действия со стихом', group: 'Основное',
    steps: [
      { text: 'Зажмите стих пальцем на полсекунды — он выделится.', target: verse, next: selectVerse, until: () => $('.selection-bar') },
      { text: 'Вверху — действия: другой перевод рядом, комментарии, цвет, заметка, закладка. «⋯» — ещё.', target: () => $(P1 + '.selection-bar'), before: selectVerse },
      { text: 'Под стихом — «Слушать» и «В проповедь».', target: () => $(P1 + '.sel-inline'), before: selectVerse },
      { text: 'Галочка слева вверху — закончить выделение. Нажмите её.', target: () => $(P1 + '.selection-bar .tb'), until: () => !$('.selection-bar') },
      { text: 'Совет: двойное быстрое касание стиха делает его любимым (сердечко).', target: null, before: (api) => api.reset() },
    ],
  },
  {
    id: 'xref', icon: Link2, title: 'Параллельные места', group: 'Основное',
    steps: [
      { text: 'Значок с числом после стиха — сколько параллельных мест. Нажмите на него.', target: () => firstVisible(P1 + '.xr'), next: () => click(firstVisible(P1 + '.xr')), until: () => $('.sheet') },
      {
        text: 'Это места Библии, где говорится о том же. Нажмите на любое — оно откроется во второй половине экрана.',
        target: () => $('.sheet'),
        before: () => !$('.sheet') && click(firstVisible(P1 + '.xr')),
        until: () => !$('.sheet') && $('.pane-slot.second'),
      },
      { text: 'Место открылось внизу (или справа). Закрыть вторую половину — крестиком вверху.', target: () => ($('.pane-slot.second') ? $(P1 + '.tb-split') : $('.sheet')), until: () => !$('.pane-slot.second') && !$('.sheet') },
    ],
  },
  {
    id: 'split', icon: Columns2, title: 'Два перевода рядом', group: 'Основное',
    steps: [
      { text: 'Эта кнопка делит экран на две части — в каждой свой перевод. Нажмите её.', target: () => $(P1 + '.tb-split'), next: () => !$('.pane-slot.second') && click($(P1 + '.tb-split')), until: () => $('.pane-slot.second') },
      { text: 'Перевод в каждой части меняется кнопкой с названием перевода.', target: () => $('.pane-slot.second .tb-module') || $(P1 + '.tb-module') },
      { text: 'Крестик на месте той же кнопки закрывает вторую часть.', target: () => $(P1 + '.tb-split'), until: () => !$('.pane-slot.second') },
    ],
  },
  {
    id: 'search', icon: Search, title: 'Поиск', group: 'Основное',
    steps: [
      { text: 'Нажмите на лупу.', target: () => $(P1 + '[aria-label="Поиск"]'), next: (api) => api.openSheet('search'), until: () => $('.sheet input') },
      { text: 'Введите слово — места появятся сразу. Можно ввести и ссылку: «Ин 3:16».', target: () => $('.sheet input'), before: (api) => !$('.sheet input') && api.openSheet('search') },
    ],
  },
  {
    id: 'saved', icon: Heart, title: 'Закладки, заметки, любимые', group: 'Мои записи',
    steps: [
      { text: 'Откройте меню — три точки вверху справа.', target: () => $(P1 + '.tb-more'), next: openMenu, until: () => $('.menu') },
      { text: '«Закладка на это место» — запомнить, где вы читаете. Закладок может быть сколько угодно.', target: menuItem('Закладка'), before: openMenu },
      { text: 'Здесь все закладки, заметки, любимые стихи и выделения.', target: menuItem('любимые стихи'), before: openMenu, next: (api) => api.openSheet('bookmarks') },
    ],
  },
  {
    id: 'sermons', icon: ScrollText, title: 'Проповеди', group: 'Мои записи',
    steps: [
      { text: 'Читая, зажмите понравившийся стих.', target: verse, next: selectVerse, until: () => $('.sel-inline') },
      { text: 'Нажмите «В проповедь».', target: () => byText(P1 + '.sel-inline .btn', 'В проповедь'), before: selectVerse, next: () => click(byText(P1 + '.sel-inline .btn', 'В проповедь')), until: () => $('.sheet #sermon-title') },
      {
        text: 'Впишите название новой проповеди и нажмите «Создать» — или выберите проповедь из списка. Стих добавится сам.',
        target: () => $('.sheet .sermon-new') || $('.sheet'),
        until: () => $('.sermon-done'),
      },
      { text: 'Стих добавлен. «Открыть проповедь» — посмотреть её, «Читать дальше» — вернуться к чтению.', target: () => $('.sheet .sermon-done') || $('.sheet'), until: () => !$('.sermon-done') },
      { text: 'Все проповеди — в меню ⋮ → «Проповеди».', target: menuItem('Проповеди'), before: (api) => (api.reset(), setTimeout(openMenu, 150)), next: (api) => api.openSheet('sermons') },
      { text: 'В проповеди: «Текст» — своя мысль; порядок меняется перетаскиванием (зажмите блок); «Кафедра» — крупно для служения.', target: () => $('.sheet'), before: (api) => !$('.sheet') && api.openSheet('sermons') },
    ],
  },
  {
    id: 'plans', icon: CalendarCheck, title: 'Планы чтения', group: 'Чтение',
    steps: [
      { text: 'Меню ⋮ → «Планы чтения».', target: menuItem('Планы чтения'), before: openMenu, next: (api) => api.openSheet('plans') },
      { text: 'Выберите план и нажмите «Начать». Потом каждый день — «Читать»: все отрывки дня на одной странице, отметки ставятся сами.', target: () => $('.sheet'), before: (api) => !$('.sheet') && api.openSheet('plans') },
    ],
  },
  {
    id: 'audio', icon: Headphones, title: 'Слушать Библию', group: 'Чтение',
    steps: [
      { text: 'Нажмите кнопку с наушниками — чтец начнёт с места, где вы читаете.', target: () => $(P1 + '.listen-fab'), next: () => click($(P1 + '.listen-fab')), until: () => $('.audio-bar') },
      { text: 'Это проигрыватель: пауза, стих назад и вперёд. Кнопка со стрелкой вниз — скачать книгу, чтобы слушать без интернета.', target: () => $('.audio-bar'), before: () => !$('.audio-bar') && click($(P1 + '.listen-fab')) },
      { text: 'Кнопка с ползунками — скорость и таймер сна. Крестик закрывает проигрыватель.', target: () => $('.audio-bar') },
    ],
  },
  {
    id: 'image', icon: ImageIcon, title: 'Картинка со стихом', group: 'Чтение',
    steps: [
      { text: 'Зажмите стих.', target: verse, next: selectVerse, until: () => $('.selection-bar') },
      { text: 'Нажмите «⋯» — там «Картинка со стихом».', target: () => $(P1 + '.selection-bar .tb-more'), before: selectVerse, next: () => click($(P1 + '.selection-bar .tb-more')), until: () => $('.menu') },
      { text: 'Нажмите «Картинка со стихом».', target: menuItem('Картинка'), next: () => click(byText('.menu .menu-item', 'Картинка')) },
      { text: 'Выберите фон и формат. Текст двигается пальцем, размер — двумя пальцами. «Поделиться» — отправить.', target: () => $('.sheet') },
    ],
  },
  {
    id: 'font', icon: Type, title: 'Размер букв и оформление', group: 'Настройка',
    steps: [
      { text: 'Поставьте два пальца на текст и разведите — буквы станут крупнее. Сведите — мельче.', target: () => $(P1 + '.scroller'), before: (api) => api.reset() },
      { text: 'Тема, шрифт и интервалы — меню ⋮ → «Оформление».', target: menuItem('Оформление'), before: openMenu, next: (api) => api.openSheet('settings') },
    ],
  },
  {
    id: 'maps', icon: MapIcon, title: 'Карты', group: 'Настройка',
    steps: [
      { text: 'Нажмите в тексте на название города или места — в списке будет «Карта». Место покажется во второй половине экрана.', target: verse },
      { text: 'Все карты — меню ⋮ → «Карты».', target: menuItem('Карты'), before: openMenu, next: (api) => api.openSheet('maps') },
    ],
  },
  {
    id: 'library', icon: Library, title: 'Переводы и словари', group: 'Настройка',
    steps: [
      { text: 'Перевод меняется этой кнопкой.', target: () => $(P1 + '.tb-module') },
      { text: 'Новые переводы, словари, комментарии — в Настройках → «Библиотека модулей».', target: prefRow('Библиотека'), before: openSettings, next: (api) => api.openSheet('library') },
      { text: 'Во вкладке «Каталог» нажмите стрелку загрузки справа от нужного модуля.', target: () => $('.sheet'), before: (api) => !$('.sheet .tabs') && api.openSheet('library') },
    ],
  },
  {
    id: 'data', icon: HardDrive, title: 'Перенос на другой телефон', group: 'Настройка',
    steps: [
      { text: 'Настройки → «Мои данные».', target: prefRow('Мои данные'), before: openSettings, next: () => click(byText('.sheet .pref-row', 'Мои данные')) },
      { text: '«Сохранить в файл» — сохраните файл в облако или мессенджер. На новом телефоне — «Восстановить из файла».', target: () => $('.sheet .pref-btns') },
    ],
  },
  {
    id: 'install', icon: Smartphone, title: 'Значок на экране телефона', group: 'Настройка',
    steps: [
      { text: 'iPhone: откройте сайт в Safari → кнопка «Поделиться» (квадрат со стрелкой) → «На экран Домой».', target: null },
      { text: 'Android: в Chrome → меню браузера ⋮ → «Установить приложение». Дальше открывайте со значка, как обычное приложение.', target: null },
    ],
  },
  {
    id: 'updates', icon: RefreshCw, title: 'Обновления', group: 'Настройка',
    steps: [
      { text: 'Приложение обновляется само, ваши записи и настройки сохраняются.', target: null },
      { text: 'Здесь можно проверить обновления и вернуться к прежней версии.', target: prefRow('Обновления'), before: openSettings },
    ],
  },
];
