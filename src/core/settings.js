// Настройки оформления: значения по умолчанию, темы и применение к CSS-переменным.

export const THEMES = {
  light: {
    label: 'Светлая',
    bg: '#f6f5f2', text: '#1d1c1a', muted: '#7d7a73', accent: '#9a6a2f', panel: '#ffffff',
    bar: '#38363a', barText: '#f3f1ec', line: '#e3e0d9', hl: '#f6e3a8', verseNum: '#55524c',
  },
  sepia: {
    label: 'Сепия',
    bg: '#f3e9d7', text: '#3b2f22', muted: '#8a7a64', accent: '#8b5a24', panel: '#faf3e6',
    bar: '#4a3d2f', barText: '#f6ecda', line: '#e2d4bb', hl: '#ebd189', verseNum: '#6b5a44',
  },
  dark: {
    label: 'Тёмная',
    bg: '#161617', text: '#dedbd4', muted: '#8d8a84', accent: '#d9a35c', panel: '#212123',
    bar: '#0c0c0d', barText: '#e8e5de', line: '#2e2e31', hl: '#5b4a1c', verseNum: '#a7a39b',
  },
};

export const FONTS = {
  system: { label: 'Системный', css: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  'PT Serif': { label: 'PT Serif', css: '"PT Serif", Georgia, serif', google: 'PT+Serif:ital,wght@0,400;0,700;1,400' },
  Literata: { label: 'Literata', css: 'Literata, Georgia, serif', google: 'Literata:ital,wght@0,300..700;1,400' },
  'Noto Serif': { label: 'Noto Serif', css: '"Noto Serif", Georgia, serif', google: 'Noto+Serif:ital,wght@0,300..700;1,400' },
  Lora: { label: 'Lora', css: 'Lora, Georgia, serif', google: 'Lora:ital,wght@0,400..700;1,400' },
  'PT Sans': { label: 'PT Sans', css: '"PT Sans", "Segoe UI", sans-serif', google: 'PT+Sans:ital,wght@0,400;0,700;1,400' },
  'IBM Plex Sans': { label: 'IBM Plex Sans', css: '"IBM Plex Sans", "Segoe UI", sans-serif', google: 'IBM+Plex+Sans:ital,wght@0,300..700;1,400' },
  Georgia: { label: 'Georgia', css: 'Georgia, "Times New Roman", serif' },
};

export const SETTINGS_VERSION = 2;

export const DEFAULT_SETTINGS = {
  v: SETTINGS_VERSION,
  theme: 'light', // light | dark | sepia | auto
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
  continuousVerses: false, // стихи сплошным абзацем
  customColors: false,
  colors: { bg: '#f6f5f2', text: '#1d1c1a', accent: '#9a6a2f', panel: '#ffffff' },
  compactToolbar: false,
  animations: true,
  radius: 12,
  focusMode: false,
  splitLayout: 'auto', // auto | rows | columns
  splitRatio: 0.5,
  primaryModule: 'rst-plus',
};

// Сохранённые настройки старых версий. v1 по умолчанию следовала теме системы,
// с v2 по умолчанию светлая: «как в системе» из v1 переводим в светлую, явный выбор не трогаем.
export function migrateSettings(s) {
  if (!s || typeof s !== 'object') return s;
  if ((s.v || 1) < 2) s = { ...s, v: 2, theme: !s.theme || s.theme === 'auto' ? 'light' : s.theme };
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
  link.href = `https://fonts.googleapis.com/css2?family=${f.google}&display=swap`;
  document.head.appendChild(link);
}

export function applySettings(settings, themeName) {
  const t = { ...THEMES[themeName] };
  if (settings.customColors) Object.assign(t, settings.colors);
  const root = document.documentElement;
  const vars = {
    '--bg': t.bg, '--text': t.text, '--muted': t.muted, '--accent': t.accent, '--panel': t.panel,
    '--bar': t.bar, '--bar-text': t.barText, '--line': t.line, '--hl': t.hl, '--verse-num': t.verseNum,
    '--font-text': FONTS[settings.fontFamily]?.css || FONTS.system.css,
    '--fs': `${settings.fontSize}px`, '--fw': settings.fontWeight, '--lh': settings.lineHeight,
    '--verse-gap': `${settings.verseSpacing}em`, '--measure': `${settings.textWidth}em`,
    '--align': settings.textAlign, '--chapter-size': `${settings.chapterTitleSize}em`,
    '--radius': `${settings.radius}px`, '--bar-h': settings.compactToolbar ? '44px' : '54px',
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, String(v));
  root.dataset.appTheme = themeName;
  root.style.colorScheme = themeName === 'dark' ? 'dark' : 'light';
  root.classList.toggle('no-anim', !settings.animations);
  ensureFont(settings.fontFamily);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t.bar);
}
