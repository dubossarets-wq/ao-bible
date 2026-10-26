// Настройки оформления: значения по умолчанию, темы и применение к CSS-переменным.
import { syncSystemBars } from './native.js';
import { N_ } from './i18n.js';

// Темы. tone: 'dark' — тёмная (свои цвета успеха и ошибки, тёмные системные элементы);
// onAccent — цвет надписей на кнопках цвета акцента
export const THEMES = {
  light: {
    label: N_('Светлая'),
    bg: '#ffffff', text: '#121212', muted: '#5f5f5f', accent: '#1c1c1e', panel: '#ffffff', onAccent: '#ffffff',
    bar: '#ffffff', barText: '#121212', line: '#e7e7e7', hl: '#fbe7a1', verseNum: '#6e6e6e',
  },
  warm: {
    label: N_('Тёплая'),
    bg: '#f6f5f2', text: '#1d1c1a', muted: '#68655e', accent: '#8c5e28', panel: '#ffffff', onAccent: '#ffffff',
    bar: '#38363a', barText: '#f3f1ec', line: '#e3e0d9', hl: '#f6e3a8', verseNum: '#55524c',
  },
  sepia: {
    label: N_('Сепия'),
    bg: '#f3e9d7', text: '#3b2f22', muted: '#6e604c', accent: '#8b5a24', panel: '#faf3e6', onAccent: '#ffffff',
    bar: '#4a3d2f', barText: '#f6ecda', line: '#e2d4bb', hl: '#ebd189', verseNum: '#6b5a44',
  },
  mint: {
    label: N_('Мята'),
    bg: '#f2faf6', text: '#14261f', muted: '#4b665b', accent: '#1b7a5c', panel: '#ffffff', onAccent: '#ffffff',
    bar: '#e2f2ea', barText: '#14261f', line: '#d3e8dc', hl: '#f5e3a0', verseNum: '#4b665b',
  },
  lavender: {
    label: N_('Лаванда'),
    bg: '#f6f3fc', text: '#221a33', muted: '#5b5373', accent: '#6346c2', panel: '#ffffff', onAccent: '#ffffff',
    bar: '#ebe4f8', barText: '#221a33', line: '#e2daf2', hl: '#f3e3a6', verseNum: '#5b5373',
  },
  sunset: {
    label: N_('Закат'),
    bg: '#fff6f0', text: '#2a1a12', muted: '#6b5243', accent: '#b4451f', panel: '#ffffff', onAccent: '#ffffff',
    bar: '#ffe5d4', barText: '#2a1a12', line: '#f1dccd', hl: '#fde2a0', verseNum: '#6b5243',
  },
  contrast: {
    label: N_('Контраст'),
    bg: '#ffffff', text: '#000000', muted: '#303030', accent: '#0037b3', panel: '#ffffff', onAccent: '#ffffff',
    bar: '#000000', barText: '#ffffff', line: '#5c5c5c', hl: '#ffe14d', verseNum: '#000000',
  },
  dark: {
    label: N_('Тёмная'), tone: 'dark',
    bg: '#161617', text: '#dedbd4', muted: '#8d8a84', accent: '#d9a35c', panel: '#212123', onAccent: '#161617',
    bar: '#0c0c0d', barText: '#e8e5de', line: '#2e2e31', hl: '#5b4a1c', verseNum: '#a7a39b',
  },
  ocean: {
    label: N_('Океан'), tone: 'dark',
    bg: '#0f1a2a', text: '#dfe7f1', muted: '#93a3b8', accent: '#5cb8f0', panel: '#16243a', onAccent: '#0f1a2a',
    bar: '#0a1422', barText: '#e6eef8', line: '#24344d', hl: '#1f4a6b', verseNum: '#8ea2bb',
  },
  black: {
    label: N_('Чёрная'), tone: 'dark',
    bg: '#000000', text: '#e4e4e4', muted: '#9a9a9a', accent: '#e8b86a', panel: '#0f0f10', onAccent: '#000000',
    bar: '#000000', barText: '#f0f0f0', line: '#28282a', hl: '#4a3b12', verseNum: '#8f8f8f',
  },
};

export const FONTS = {
  system: { label: N_('Системный'), css: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  'PT Serif': { label: 'PT Serif', css: '"PT Serif", Georgia, serif', google: 'PT+Serif:ital,wght@0,400;0,700;1,400' },
  Literata: { label: 'Literata', css: 'Literata, Georgia, serif', google: 'Literata:ital,wght@0,300..700;1,400' },
  'Noto Serif': { label: 'Noto Serif', css: '"Noto Serif", Georgia, serif', google: 'Noto+Serif:ital,wght@0,300..700;1,400' },
  Lora: { label: 'Lora', css: 'Lora, Georgia, serif', google: 'Lora:ital,wght@0,400..700;1,400' },
  'PT Sans': { label: 'PT Sans', css: '"PT Sans", "Segoe UI", sans-serif', google: 'PT+Sans:ital,wght@0,400;0,700;1,400' },
  'IBM Plex Sans': { label: 'IBM Plex Sans', css: '"IBM Plex Sans", "Segoe UI", sans-serif', google: 'IBM+Plex+Sans:ital,wght@0,300..700;1,400' },
  Georgia: { label: 'Georgia', css: 'Georgia, "Times New Roman", serif' },
};

export const SETTINGS_VERSION = 3;

export const DEFAULT_SETTINGS = {
  v: SETTINGS_VERSION,
  theme: 'light', // ключ THEMES или auto
  fontFamily: 'system',
  fontSize: 19,
  fontWeight: 400,
  lineHeight: 1.45,
  verseSpacing: 0.55, // em
  textWidth: 44, // em
  textAlign: 'left',
  showVerseNumbers: true,
  chapterTitleSize: 2.1, // em
  showStrongs: false,
  showHeadings: true,
  showXrefButtons: true,
  showIllustrations: true, // значок картинки у стихов, к которым есть иллюстрация
  continuousVerses: false, // стихи сплошным абзацем
  customColors: false, // прежний вариант «своих цветов» (до v3); теперь — colorOverrides
  colors: { bg: '#f6f5f2', text: '#1d1c1a', accent: '#8c5e28', panel: '#ffffff' },
  colorOverrides: {}, // свои цвета поверх темы, по одному: { accent: '#…', bar: '#…', strong: '#…' }
  strongSize: 0.5, // em — номера Стронга
  strongPos: 'sup', // sup | inline | sub
  verseNumSize: 0.6, // em
  verseNumPos: 'sup', // sup | inline
  headingSize: 0.8, // em — заголовки разделов
  uiFontSize: 15, // px — меню, окна, кнопки
  barHeight: 54, // px — верхняя панель
  animations: true,
  focusMode: false,
  splitLayout: 'auto', // auto | rows | columns
  bgImage: 0, // своя картинка под текстом: 0 — нет, иначе время загрузки (сама картинка — в IndexedDB, core/userBg.js)
  bgPhoto: null, // какое из готовых фото выбрано (id из images/verse-bg/index.json); null — своя картинка
  bgVeil: 72, // % — насколько цвет страницы закрывает картинку
  bgBlur: 0, // px — размытие картинки
  splitRatio: 0.5,
  syncScroll: true, // синхронная прокрутка двух панелей
  bookMode: false, // режим «как книга»
  commentaryFontSize: 19, // px — текст в окне комментариев
  inlineCommentaries: null, // какие комментарии подписывать в тексте: null — все включённые, иначе список id
  primaryModule: 'rst-plus',
  audioFollowsTranslation: true, // сменили перевод во время чтения вслух — запись на его языке
  ttsFallback: false, // ИИ-диктор (синтез речи), когда к главе нет аудиозаписи
  // Что показывать в меню ⋮ (остальное — в «Настройках»)
  menu: { help: true, lastBookmark: true, sermons: true, plans: true, listen: true, maps: true, focus: false, book: false, split: true },
};

// Сохранённые настройки старых версий. v1 по умолчанию следовала теме системы,
// с v2 по умолчанию светлая: «как в системе» из v1 переводим в светлую, явный выбор не трогаем.
export function migrateSettings(s) {
  if (!s || typeof s !== 'object') return s;
  if ((s.v || 1) < 2) s = { ...s, v: 2, theme: !s.theme || s.theme === 'auto' ? 'light' : s.theme };
  // v3: «свои цвета» стали отдельными для каждого цвета — прежние переносим как есть
  if (s.v < 3) s = { ...s, v: 3, colorOverrides: s.customColors && s.colors ? { ...s.colors } : s.colorOverrides || {}, customColors: false };
  return s;
}

export function resolveTheme(settings, prefersDark) {
  if (settings.theme === 'auto') return prefersDark ? 'dark' : 'light';
  return THEMES[settings.theme] ? settings.theme : 'light';
}

const loadedFonts = new Set();
export function ensureFont(key) {
  const f = FONTS[key];
  if (!f?.google || loadedFonts.has(key)) return;
  loadedFonts.add(key);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.crossOrigin = 'anonymous'; // прозрачный ответ — service worker сохранит шрифт для работы без сети
  link.href = `https://fonts.googleapis.com/css2?family=${f.google}&display=swap`;
  document.head.appendChild(link);
}

// Цвета, которые можно поменять по одному (поверх темы). heading и strong по умолчанию — цвет акцента.
export const COLOR_KEYS = [
  ['accent', N_('Акцент интерфейса')],
  ['bar', N_('Верхняя панель')],
  ['barText', N_('Надписи на верхней панели')],
  ['bg', N_('Фон страницы')],
  ['text', N_('Текст')],
  ['muted', N_('Бледный текст')],
  ['panel', N_('Окна и карточки')],
  ['line', N_('Линии и рамки')],
  ['verseNum', N_('Номера стихов')],
  ['heading', N_('Заголовки разделов')],
  ['strong', N_('Номера Стронга')],
];

// Итоговые цвета: тема + свои цвета
export function themeColors(settings, themeName) {
  const t = { ...THEMES[themeName] };
  if (settings.customColors) Object.assign(t, settings.colors);
  t.heading = t.accent;
  t.strong = t.accent;
  for (const [k, v] of Object.entries(settings.colorOverrides || {})) if (v) t[k] = v;
  return t;
}

export function applySettings(settings, themeName) {
  const t = themeColors(settings, themeName);
  const root = document.documentElement;
  const vars = {
    '--bg': t.bg, '--text': t.text, '--muted': t.muted, '--accent': t.accent, '--panel': t.panel,
    '--bar': t.bar, '--bar-text': t.barText, '--on-accent': t.onAccent || '#ffffff', '--line': t.line, '--hl': t.hl, '--verse-num': t.verseNum,
    '--font-text': FONTS[settings.fontFamily]?.css || FONTS.system.css,
    '--fs': `${settings.fontSize}px`, '--fw': settings.fontWeight, '--lh': settings.lineHeight,
    '--verse-gap': `${settings.verseSpacing}em`, '--measure': `${settings.textWidth}em`,
    '--align': settings.textAlign, '--chapter-size': `${settings.chapterTitleSize}em`,
    '--radius': '12px', '--bar-h': `${settings.barHeight || 54}px`,
    '--heading': t.heading, '--strong': t.strong, '--heading-size': `${settings.headingSize ?? 0.8}em`,
    '--sn-size': `${settings.strongSize ?? 0.5}em`, '--sn-va': { inline: 'baseline', sub: 'sub' }[settings.strongPos] || 'super',
    '--vn-size': `${settings.verseNumSize ?? 0.6}em`, '--vn-top': settings.verseNumPos === 'inline' ? '0' : '-.32em',
    '--ui-fs': `${settings.uiFontSize || 15}px`,
    '--bg-veil': `${settings.bgVeil ?? 72}%`, '--bg-blur': `${settings.bgBlur || 0}px`,
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, String(v));
  root.dataset.appTheme = themeName;
  root.dataset.appTone = THEMES[themeName]?.tone || 'light';
  root.style.colorScheme = THEMES[themeName]?.tone === 'dark' ? 'dark' : 'light';
  root.classList.toggle('no-anim', !settings.animations);
  ensureFont(settings.fontFamily);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t.bar); // цвет строки состояния Android — как у верхней панели
  syncSystemBars(t.bar, t.panel); // приложение из Google Play: цвет системных полос (низ — как сплошное нижнее меню)
}
