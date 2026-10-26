// Настройки оформления — все изменения применяются сразу через CSS-переменные.
// Главный экран: сверху живой образец текста (закреплён), под ним самое частое — тема, размер и вид текста;
// ниже — подразделы (шрифт, номера и заголовки, фон, цвета, кнопки и панели, комментарии), внизу — сброс.
// Подраздел выезжает справа внутри того же окна; стрелка ‹ возвращает на главный экран «Оформления».
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  RotateCcw, ChevronRight, Check, Minus, Plus, Image as ImageIcon, ImagePlus, Ban, Type, Hash, PanelTop, MessageSquareText, Palette,
  AlignLeft, AlignJustify, Columns2, Rows2, Pipette,
} from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { FONTS, ensureFont, COLOR_KEYS, themeColors, THEMES, DEFAULT_SETTINGS } from '../core/settings.js';
import { Segmented, Switch, Hint, Fold, ConfirmButton } from './ui.jsx';
import { HL_COLORS } from '../core/highlights.js';
import { saveBg, clearBg } from '../core/userBg.js';
import { t, N_ } from '../core/i18n.js';
import { formatRef } from '../core/books.js';

// Готовые цвета для быстрого выбора акцента, верхней панели, номеров Стронга и заголовков
const ACCENTS = [
  ['#8c5e28', N_('Коричневый')], ['#b4412f', N_('Красный')], ['#c2410c', N_('Оранжевый')], ['#a16207', N_('Горчичный')], ['#3f7a4a', N_('Зелёный')],
  ['#0f766e', N_('Бирюзовый')], ['#2563eb', N_('Синий')], ['#4f46e5', N_('Индиго')], ['#7c3aed', N_('Фиолетовый')], ['#be185d', N_('Малиновый')],
];
const BARS = [
  ['#38363a', N_('Графит')], ['#0c0c0d', N_('Чёрный')], ['#4a3d2f', N_('Коричневый')], ['#1e3a5f', N_('Тёмно-синий')],
  ['#14532d', N_('Тёмно-зелёный')], ['#5b2333', N_('Бордовый')], ['#ffffff', N_('Белый')], ['#f3f1ec', N_('Светлый')],
];

// Светлый ли цвет — чтобы подобрать к нему читаемые надписи и галочку
const isLight = (hex) => {
  const n = parseInt(String(hex).slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 160;
};

// Строка цвета (тонкая настройка): название, «вернуть цвет темы», выбор своего цвета
// Пока открыта палитра, вверху экрана виден образец (onLive) — палитра на телефоне закрывает нижнюю часть
function ColorRow({ id, label, value, changed, onChange, onReset, onLive }) {
  return (
    <div className={`color-row ${changed ? '' : 'same'}`}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <button className="icon-btn" onClick={onReset} aria-label={t('{label}: цвет темы', { label })} title={t('Вернуть цвет темы')}>
        <RotateCcw size={16} />
      </button>
      <input
        id={id}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={() => onLive?.(true)}
        onFocus={() => onLive?.(true)}
        onBlur={() => onLive?.(false)}
      />
    </div>
  );
}

// Что показать в образце, пока открыта палитра для этого цвета
const LIVE = {
  strong: { sn: true, num: false, view: 'flow', short: true },
  heading: { head: true, view: 'flow', short: true },
  bar: { bar: true, num: false, view: 'flow', short: true },
  barText: { bar: true, num: false, view: 'flow', short: true },
  verseNum: {},
};

// Выбор цвета кружками: первый — цвет темы, дальше готовые, последний — свой (палитра)
function ColorPick({ id, label, value, base, changed, list, onPick, onReset, onLive }) {
  const v = String(value || '').toLowerCase();
  const custom = changed && !list.some(([c]) => c === v);
  const mark = (c) => <Check size={18} strokeWidth={3} style={{ color: isLight(c) ? '#1d1c1a' : '#ffffff' }} aria-hidden="true" />;
  return (
    <div className="field">
      <span className="field-label" id={`${id}-l`}>
        {label}
      </span>
      <div className="swatches" role="group" aria-labelledby={`${id}-l`}>
        <button type="button" id={`${id}-theme`} className={`swatch theme ${changed ? '' : 'on'}`} style={{ background: base }} onClick={onReset} aria-pressed={!changed} aria-label={t('Как в теме')} title={t('Как в теме')}>
          {!changed && mark(base)}
        </button>
        {list.map(([c, name]) => (
          <button type="button" key={c} id={`${id}-${c.slice(1)}`} className={`swatch ${changed && v === c ? 'on' : ''}`} style={{ background: c }} onClick={() => onPick(c)} aria-pressed={changed && v === c} aria-label={t(name)} title={t(name)}>
            {changed && v === c && mark(c)}
          </button>
        ))}
        <span className={`swatch custom ${custom ? 'on' : ''}`} style={custom ? { background: value } : undefined} title={t('Свой цвет')}>
          {custom ? mark(value) : <Pipette size={18} aria-hidden="true" />}
          <input
            type="color"
            aria-label={t('Свой цвет')}
            value={/^#[0-9a-f]{6}$/i.test(v) ? v : '#888888'}
            onChange={(e) => onPick(e.target.value)}
            onClick={() => onLive?.(true)}
            onFocus={() => onLive?.(true)}
            onBlur={() => onLive?.(false)}
          />
        </span>
      </div>
    </div>
  );
}

// Ползунок с кнопками «меньше / больше» по краям (крупные зоны нажатия) и понятным значением словами
function Range({ id, label, hint, value: saved, min, max, step, onChange: commit, word, big }) {
  const fix = (x) => Math.min(max, Math.max(min, Math.round(x / step) * step));
  // Пока ползунок тянут, он и подпись двигаются сразу, а в настройки (и на всю главу под окном) значение уходит
  // не чаще раза в 180 мс и при отпускании: раньше каждый шаг перекладывал весь текст — 150–450 мс на телефоне
  const [value, setValue] = useState(saved);
  useEffect(() => setValue(saved), [saved]);
  const timer = useRef(0);
  const last = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onChange = (x, now = false) => {
    setValue(x);
    clearTimeout(timer.current);
    const wait = now ? 0 : Math.max(0, 180 - (Date.now() - last.current));
    timer.current = setTimeout(() => ((last.current = Date.now()), commit(x)), wait);
  };
  const shown = word(value);
  return (
    <div className="field ap-range">
      <span className="field-row">
        <label className="field-label" htmlFor={id}>
          {label}
          {hint && <Hint>{hint}</Hint>}
        </label>
        <span className="field-value">{shown}</span>
      </span>
      <span className="ap-range-row">
        <button type="button" className={`ap-step ${big ? 'aa' : ''}`} onClick={() => onChange(+fix(value - step).toFixed(3), true)} disabled={value <= min} aria-label={t('{label}: меньше', { label })}>
          {big ? <span className="aa-s">A</span> : <Minus size={18} />}
        </button>
        <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} onPointerUp={(e) => onChange(+e.target.value, true)} onKeyUp={(e) => onChange(+e.target.value, true)} aria-valuetext={String(shown)} />
        <button type="button" className={`ap-step ${big ? 'aa' : ''}`} onClick={() => onChange(+fix(value + step).toFixed(3), true)} disabled={value >= max} aria-label={t('{label}: больше', { label })}>
          {big ? <span className="aa-l">A</span> : <Plus size={18} />}
        </button>
      </span>
    </div>
  );
}

// Понятные значения вместо чисел
const words = (lo, hi, a, b, c) => (v) => t(v < lo ? a : v <= hi ? b : c);
const SIZE_W = (lo, hi) => words(lo, hi, N_('мелкий'), N_('обычный'), N_('крупный'));
const WEIGHTS = { 300: N_('тонкий'), 400: N_('обычный'), 500: N_('средний'), 600: N_('полужирный'), 700: N_('жирный') };
const LH_W = words(1.32, 1.62, N_('плотный'), N_('обычный'), N_('свободный'));
const GAP_W = (v) => (v < 0.05 ? t('нет') : words(0.35, 0.85, N_('маленькое'), N_('обычное'), N_('большое'))(v));
const WIDTH_W = words(36, 56, N_('узкая'), N_('обычная'), N_('широкая'));
const BAR_W = words(50, 58, N_('низкая'), N_('обычная'), N_('высокая'));
const BLUR_W = (v) => (v === 0 ? t('нет') : words(7, 13, N_('лёгкое'), N_('среднее'), N_('сильное'))(v));

// Образец текста: показывает то, что меняет экран, и обновляется сразу.
// Быт 1:1–2 с заголовком, который стоит над ними в синодальном тексте; в других языках интерфейса — классический
// перевод на этом языке. В первом стихе номер Стронга — {номер} сразу после слова (порядок слов у языков разный).
const V1 = () => t('В начале{7225} сотворил{1254} Бог{430} небо{8064} и{853} землю.{776}');
const V2 = () => t('Земля же была безвидна и пуста, и тьма над бездною, и Дух Божий носился над водою.');
const v1Plain = () => V1().replace(/\{\d+\}/g, '');
// «слово{номер} слово{номер}…» → кусочки текста и номера Стронга после слов
const v1Parts = (sn, off) =>
  V1()
    .split(/\{(\d+)\}/)
    .map((part, i) => (i % 2 ? sn && <span key={i} className={`pv-sn ${off ? 'off' : ''}`}>{part}</span> : <React.Fragment key={i}>{part}</React.Fragment>));

// short — только первый стих; noText — без стихов (кнопки и панели)
export function Sample({ s: real, bar, head, num, sn, ui, colors, live, short, noText, view = textView(real) }) {
  // live — образец при выборе цвета: номера и заголовки видны всегда
  const s = live ? { ...real, showStrongs: true, showHeadings: true } : real;
  const showNum = num !== false && s.showVerseNumbers && view !== 'book';
  const v1 = v1Parts(sn, !s.showStrongs);
  const verses = noText ? null : view === 'verses' || short ? (
    <>
      <span className="pv-verse">
        {showNum && <span className="pv-num">1</span>}
        {v1}
      </span>
      {!short && (
        <span className="pv-verse">
          {showNum && <span className="pv-num">2</span>}
          {V2()}
        </span>
      )}
    </>
  ) : (
    <span className={`pv-verse ${view === 'book' ? 'book' : ''}`}>
      {showNum && <span className="pv-num">1</span>}
      {v1} {showNum && <span className="pv-num">2</span>}
      {V2()}
    </span>
  );
  return (
    <div className={`preview-card sample ${colors ? 'colors' : ''}`} aria-hidden="true">
      {bar && (
        <div className="pv-bar">
          <span className="pv-pill">RST+</span> {formatRef({ book: 'Gen', chapter: 1, verse: 1 })}
        </div>
      )}
      <div className="pv-body">
        {head && !noText && s.showHeadings && <span className="pv-head">{t('Сотворение неба и земли')}</span>}
        {verses}
        {(ui || colors) && (
          <span className="pv-ui">
            <span className="pv-btn">{t('Кнопка')}</span>
            <span className="pv-card">
              {t('Окно или карточка')}
              <span className="pv-muted">{t('бледный текст')}</span>
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

// Образец, закреплённый вверху экрана: при прокрутке настроек остаётся на виду
const Live = (props) => (
  <div className="ap-live">
    <Sample {...props} />
  </div>
);

// Вид текста — один выбор вместо трёх переключателей (хранится в прежних полях, чтобы ничего не сбилось)
export const textView = (s) => (s.bookMode ? 'book' : s.continuousVerses ? 'flow' : 'verses');
const VIEW_NAMES = { verses: N_('По стихам'), flow: N_('Сплошной'), book: N_('Как книга') };
// Схемы видов текста: строки; «n» — номер стиха, «i» — красная строка, «gap» — промежуток между стихами
const VIEW_PICS = {
  verses: [['n', 88], [58], 'gap', ['n', 92], [100], [34], 'gap', ['n', 70]],
  flow: [['n', 90], [100], [38, 'n', 50], [100], [72, 'n', 16], [56]],
  book: [['i', 76], [100], [100], [100], [48], ['i', 70]],
};
function ViewPic({ kind }) {
  return (
    <span className="vw-pic" aria-hidden="true">
      {VIEW_PICS[kind].map((row, i) =>
        row === 'gap' ? (
          <span key={i} className="vw-gap" />
        ) : (
          <span key={i} className="vw-row">
            {row.map((x, j) => (x === 'n' ? <i key={j} className="vw-n" /> : x === 'i' ? <i key={j} className="vw-i" /> : <b key={j} style={{ flexBasis: `${x}%` }} />))}
          </span>
        )
      )}
    </span>
  );
}

const THEME_NAMES = { ...Object.fromEntries(Object.entries(THEMES).map(([k, v]) => [k, v.label])), auto: N_('Как в системе') };

// Кружок темы: её страница, полоска верхней панели, буквы цветом текста и точка цвета акцента
function ThemeTile({ id, on, onPick }) {
  const th = THEMES[id] || THEMES.light;
  const L = THEMES.light;
  const D = THEMES.dark;
  const auto = id === 'auto';
  const aa = t('Аа');
  return (
    <button type="button" className={`theme-tile ${on ? 'on' : ''}`} onClick={onPick} aria-pressed={on} data-theme-id={id}>
      <span className="theme-dot" aria-hidden="true" style={{ background: auto ? `linear-gradient(90deg, ${L.bg} 50%, ${D.bg} 50%)` : th.bg, borderColor: auto ? L.line : th.line }}>
        <span className="td-bar" style={{ background: auto ? `linear-gradient(90deg, ${L.bar} 50%, ${D.bar} 50%)` : th.bar }} />
        {auto ? (
          <span className="td-aa split">
            <span style={{ color: L.text }}>{aa.slice(0, 1)}</span>
            <span style={{ color: D.text }}>{aa.slice(1)}</span>
          </span>
        ) : (
          <span className="td-aa" style={{ color: th.text }}>
            {aa}
          </span>
        )}
        <span className="td-accent" style={{ background: auto ? D.accent : th.accent }} />
      </span>
      <span className="theme-name">{t(THEME_NAMES[id])}</span>
    </button>
  );
}

// Подразделы
const BLOCKS = [
  ['font', Type, N_('Шрифт')],
  ['nums', Hash, N_('Номера и заголовки')],
  ['bg', ImageIcon, N_('Фон')],
  ['colors', Palette, N_('Цвета')],
  ['ui', PanelTop, N_('Кнопки и панели')],
  ['comments', MessageSquareText, N_('Комментарии')],
];
// Прежние названия блоков (если окно открывают с payload.block) → новые подразделы; null — главный экран
const OLD_BLOCKS = { theme: null, view: null, text: 'font', verseNums: 'nums', strongs: 'nums', headings: 'nums', hl: 'colors' };
const POS = { sup: N_('Над строкой'), inline: N_('В строке'), sub: N_('Под строкой') };

// Всё, что относится к оформлению: «Сбросить оформление» возвращает только это (переводы, меню, аудио не трогает)
const LOOK_KEYS = [
  'theme', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'verseSpacing', 'textWidth', 'textAlign', 'showVerseNumbers', 'chapterTitleSize',
  'showStrongs', 'showHeadings', 'showXrefButtons', 'showIllustrations', 'continuousVerses', 'bookMode', 'customColors', 'colors', 'colorOverrides',
  'strongSize', 'strongPos', 'verseNumSize', 'verseNumPos', 'headingSize', 'uiFontSize', 'barHeight', 'animations', 'focusMode', 'splitLayout',
  'bgImage', 'bgPhoto', 'bgVeil', 'bgBlur', 'commentaryFontSize',
];

function BlockRow({ icon: Icon, title, sub, onClick }) {
  return (
    <button className="pref-row" onClick={onClick}>
      <Icon size={19} />
      <span className="pref-row-text">
        {title}
        {sub && <small>{sub}</small>}
      </span>
      <ChevronRight size={17} className="pref-chev" />
    </button>
  );
}

export default function AppearanceSettings({ onClose, payload }) {
  const { settings: s, setSettings: set, themeName, modules, hlLabels, setHlLabels, toast } = useApp();
  const fileRef = useRef(null);
  const screenRef = useRef(null);
  const stripRef = useRef(null);
  const mainScroll = useRef(0);
  const first = payload?.block;
  const [block, setBlock] = useState(first ? (first in OLD_BLOCKS ? OLD_BLOCKS[first] : first) : null);
  const [dir, setDir] = useState('');
  // Переход в подраздел и обратно: запоминаем, докуда был прокручен главный экран
  const go = (b) => {
    const body = screenRef.current?.closest('.sheet-body');
    if (!block && body) mainScroll.current = body.scrollTop;
    setDir(b ? 'fwd' : 'back');
    setBlock(b);
  };
  useLayoutEffect(() => {
    const body = screenRef.current?.closest('.sheet-body');
    if (body) body.scrollTop = block ? 0 : mainScroll.current;
    // Выбранная тема — на виду в ленте
    const strip = stripRef.current;
    const on = strip?.querySelector('.theme-tile.on');
    if (!block && on) strip.scrollLeft = Math.max(0, on.offsetLeft - (strip.clientWidth - on.offsetWidth) / 2);
  }, [block]);

  // Готовые фото — свободные снимки из фонов для картинок со стихом (public/images/verse-bg)
  const [photos, setPhotos] = useState(null);
  React.useEffect(() => {
    if (block === 'font') Object.keys(FONTS).forEach(ensureFont); // каждый шрифт в списке показан самим собой
    if (block !== 'bg' || photos) return;
    fetch('images/verse-bg/index.json')
      .then((r) => r.json())
      .then((j) => setPhotos(j.images || []))
      .catch(() => setPhotos([]));
  }, [block, photos]);
  const pickBg = async (file, bgPhoto = null) => {
    if (!file) return;
    try {
      await saveBg(file);
      set({ bgImage: Date.now(), bgPhoto });
    } catch {
      toast(t('Не удалось открыть картинку'), 'error');
    }
  };
  const pickPhoto = (ph) =>
    fetch(`images/verse-bg/${ph.file}`)
      .then((r) => r.blob())
      .then((b) => pickBg(b, ph.id))
      .catch(() => toast(t('Не удалось открыть картинку'), 'error'));

  const commentaries = modules.filter((m) => m.type === 'commentary' && m.enabled !== false);
  const base = themeColors({}, themeName); // цвета самой темы, без своих
  const eff = themeColors(s, themeName); // цвета, которые сейчас на экране
  const [live, setLive] = useState(null); // какой цвет сейчас выбирают в палитре
  const liveFor = (k) => (on) => setLive((cur) => (on ? k : cur === k ? null : cur));
  const over = s.colorOverrides || {};
  const setColor = (k, v) => set({ colorOverrides: { ...over, [k]: v } });
  const resetColor = (...keys) => set({ colorOverrides: Object.fromEntries(Object.entries(over).filter(([k]) => !keys.includes(k))) });
  const inlineCount = s.inlineCommentaries ? commentaries.filter((m) => s.inlineCommentaries.includes(m.id)).length : commentaries.length;
  const resetLook = () => {
    set(Object.fromEntries(LOOK_KEYS.map((k) => [k, DEFAULT_SETTINGS[k] ?? null])));
    toast(t('Оформление сброшено'));
  };

  // В строке подраздела — текущее значение, чтобы не открывать его ради проверки
  const nums = [s.showVerseNumbers && t('Номера стихов'), s.showStrongs && t('Номера Стронга'), s.showHeadings && t('Заголовки разделов')].filter(Boolean);
  const subs = {
    font: t(FONTS[s.fontFamily]?.label || FONTS.system.label),
    nums: nums.length ? nums.join(', ') : t('выкл'),
    bg: s.bgImage ? t('С картинкой') : t('Без фона'),
    colors: Object.keys(over).length ? t('Свои цвета: {n}', { n: Object.keys(over).length }) : t('Как в теме'),
    ui: [s.focusMode && t('Режим чтения'), t('Кнопки в тексте, меню, верхняя панель')].filter(Boolean).join(' · '),
    comments: t('{n} из {total}', { n: inlineCount, total: commentaries.length }),
  };
  const shown = BLOCKS.filter(([id]) => id !== 'comments' || commentaries.length > 0);
  const cur = BLOCKS.find(([id]) => id === block);
  const ownBg = !!s.bgImage && !s.bgPhoto;

  return (
    <BottomSheet title={cur ? t(cur[2]) : t('Оформление')} onClose={onClose} onBack={cur ? () => go(null) : null} initial={1}>
      {live && (
        <div className="live-sample" aria-hidden="true">
          <Sample s={s} live {...(LIVE[live] || { bar: true, head: true, sn: true, ui: true, short: true })} />
        </div>
      )}

      <div ref={screenRef} key={block || 'main'} className={`ap-screen ${dir}`}>
        {!cur && (
          <>
            <Live s={s} head />

            <div className="field">
              <span className="field-label" id="set-theme-l">
                {t('Тема')}
              </span>
              <div ref={stripRef} id="set-theme" className="theme-strip" role="group" aria-labelledby="set-theme-l">
                {Object.keys(THEME_NAMES).map((k) => (
                  <ThemeTile key={k} id={k} on={s.theme === k} onPick={() => set({ theme: k })} />
                ))}
              </div>
            </div>

            <Range id="set-size" label={t('Размер текста')} big value={s.fontSize} min={13} max={40} step={1} onChange={(fontSize) => set({ fontSize })} word={(v) => `${v} px`} />

            <div className="field">
              <span className="field-label" id="set-view-l">
                {t('Вид текста')}
              </span>
              <div id="set-view" className="view-tiles" role="group" aria-labelledby="set-view-l">
                {Object.entries(VIEW_NAMES).map(([k, name]) => {
                  const on = textView(s) === k;
                  return (
                    <button key={k} type="button" className={`view-tile ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => set({ bookMode: k === 'book', continuousVerses: k === 'flow' })}>
                      <ViewPic kind={k} />
                      <span className="view-name">{t(name)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pref-list-main ap-list">
              {shown.map(([id, icon, title]) => (
                <BlockRow key={id} icon={icon} title={t(title)} sub={subs[id]} onClick={() => go(id)} />
              ))}
            </div>

            <div className="ap-reset">
              <ConfirmButton className="btn btn-block" confirmText={t('Да, сбросить')} onConfirm={resetLook}>
                <RotateCcw size={16} /> {t('Сбросить оформление')}
              </ConfirmButton>
            </div>
          </>
        )}

        {block === 'font' && (
          <>
            <Live s={s} head />
            <div id="set-font" className="font-list" role="radiogroup" aria-label={t('Шрифт')}>
              {Object.entries(FONTS).map(([k, f]) => {
                const on = s.fontFamily === k;
                return (
                  <button key={k} type="button" role="radio" aria-checked={on} aria-label={t(f.label)} className={`font-row ${on ? 'on' : ''}`} onClick={() => (ensureFont(k), set({ fontFamily: k }))}>
                    <span className="font-text">
                      <span className="font-sample" style={{ fontFamily: f.css }}>
                        {t('В начале было Слово')}
                      </span>
                      <small>{t(f.label)}</small>
                    </span>
                    <span className="font-check">{on && <Check size={20} strokeWidth={2.6} />}</span>
                  </button>
                );
              })}
            </div>
            <section className="ap-card">
              <Segmented
                id="set-weight"
                label={
                  <>
                    {t('Толщина')}
                    <span className="field-value">{t(WEIGHTS[s.fontWeight] || WEIGHTS[400])}</span>
                  </>
                }
                value={s.fontWeight}
                onChange={(fontWeight) => set({ fontWeight })}
                options={Object.entries(WEIGHTS).map(([w, name]) => [+w, <span key={w} className="wt" style={{ fontWeight: +w }}>{t('Аа')}</span>, t(name)])}
              />
              <Range id="set-lh" label={t('Межстрочный интервал')} value={s.lineHeight} min={1.1} max={2.2} step={0.05} onChange={(lineHeight) => set({ lineHeight })} word={LH_W} />
              <Range id="set-vgap" label={t('Расстояние между стихами')} value={s.verseSpacing} min={0} max={1.6} step={0.05} onChange={(verseSpacing) => set({ verseSpacing })} word={GAP_W} />
              <Range id="set-width" label={t('Ширина текста')} hint={t('Заметно на широком экране')} value={s.textWidth} min={24} max={80} step={1} onChange={(textWidth) => set({ textWidth })} word={WIDTH_W} />
              <Segmented
                id="set-align"
                label={t('Выравнивание')}
                value={s.textAlign}
                onChange={(textAlign) => set({ textAlign })}
                options={[
                  ['left', <><AlignLeft size={17} aria-hidden="true" /> {t('По левому краю')}</>],
                  ['justify', <><AlignJustify size={17} aria-hidden="true" /> {t('По ширине')}</>],
                ]}
              />
            </section>
          </>
        )}

        {block === 'nums' && (
          <>
            <section className="ap-card lead">
              <Switch id="set-vn" checked={s.showVerseNumbers} onChange={(showVerseNumbers) => set({ showVerseNumbers })} label={t('Номера стихов')} />
              <p className="ap-mini" aria-hidden="true">
                <span className="clamp2">
                  {s.showVerseNumbers && <span className="pv-num">1</span>}
                  {v1Plain()} {s.showVerseNumbers && <span className="pv-num">2</span>}
                  {V2()}
                </span>
              </p>
              {s.showVerseNumbers && (
                <>
                  <Range id="set-vn-size" label={t('Размер')} value={s.verseNumSize} min={0.4} max={1.2} step={0.05} onChange={(verseNumSize) => set({ verseNumSize })} word={SIZE_W(0.52, 0.8)} />
                  <Segmented id="set-vn-pos" label={t('Положение')} value={s.verseNumPos} onChange={(verseNumPos) => set({ verseNumPos })} options={['sup', 'inline'].map((k) => [k, t(POS[k])])} />
                </>
              )}
            </section>

            <section className="ap-card lead">
              <Switch id="set-strong" checked={s.showStrongs} onChange={(showStrongs) => set({ showStrongs })} label={t('Номера Стронга')} hint={t('Только в переводах с номерами Стронга, например RST+')} />
              <p className="ap-mini" aria-hidden="true">
                {v1Parts(true, !s.showStrongs)}
              </p>
              {s.showStrongs && (
                <>
                  <Range id="set-sn-size" label={t('Размер')} value={s.strongSize} min={0.35} max={1} step={0.05} onChange={(strongSize) => set({ strongSize })} word={SIZE_W(0.45, 0.7)} />
                  <Segmented id="set-sn-pos" label={t('Положение')} value={s.strongPos} onChange={(strongPos) => set({ strongPos })} options={['sup', 'inline', 'sub'].map((k) => [k, t(POS[k])])} />
                  <ColorPick id="sw-strong" label={t('Цвет')} value={eff.strong} base={eff.accent} changed={!!over.strong} list={ACCENTS} onPick={(v) => setColor('strong', v)} onReset={() => resetColor('strong')} onLive={liveFor('strong')} />
                </>
              )}
            </section>

            <section className="ap-card lead">
              <Switch id="set-head" checked={s.showHeadings} onChange={(showHeadings) => set({ showHeadings })} label={t('Заголовки разделов')} />
              <p className="ap-mini" aria-hidden="true">
                <span className={`pv-head ${s.showHeadings ? '' : 'off'}`}>{t('Сотворение неба и земли')}</span>
                <span className="clamp1">{v1Plain()}</span>
              </p>
              {s.showHeadings && (
                <>
                  <Range id="set-head-size" label={t('Размер')} value={s.headingSize} min={0.6} max={1.4} step={0.05} onChange={(headingSize) => set({ headingSize })} word={SIZE_W(0.72, 1)} />
                  <ColorPick id="sw-heading" label={t('Цвет')} value={eff.heading} base={eff.accent} changed={!!over.heading} list={ACCENTS} onPick={(v) => setColor('heading', v)} onReset={() => resetColor('heading')} onLive={liveFor('heading')} />
                </>
              )}
            </section>

            <section className="ap-card">
              <h3 className="ap-card-title">{t('Заголовки глав')}</h3>
              <p className="ap-mini" aria-hidden="true">
                <span className="ap-chap">{t('Глава {n}', { n: 1 })}</span>
              </p>
              <Range id="set-ch" label={t('Размер')} value={s.chapterTitleSize} min={1.1} max={3.2} step={0.1} onChange={(chapterTitleSize) => set({ chapterTitleSize })} word={SIZE_W(1.7, 2.5)} />
            </section>
          </>
        )}

        {block === 'bg' && (
          <>
            <div className="ap-live">
              <div className="bg-preview" aria-hidden="true">
                <span className="pv-head">{t('Сотворение неба и земли')}</span>
                <span className="bg-text">{v1Plain()}</span>
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => (pickBg(e.target.files?.[0]), (e.target.value = ''))} />
            <div className="bg-grid" role="group" aria-label={t('Фон')}>
              <button type="button" className={`bg-tile bg-none ${s.bgImage ? '' : 'on'}`} aria-pressed={!s.bgImage} onClick={() => (clearBg(), set({ bgImage: 0, bgPhoto: null }))}>
                <Ban size={22} aria-hidden="true" />
                <span>{t('Без фона')}</span>
              </button>
              <button type="button" className={`bg-tile bg-own ${ownBg ? 'on' : ''}`} aria-pressed={ownBg} onClick={() => fileRef.current?.click()}>
                <ImagePlus size={22} aria-hidden="true" />
                <span>{t('Своё фото')}</span>
              </button>
              {(photos || []).map((ph) => {
                const on = !!s.bgImage && s.bgPhoto === ph.id;
                return (
                  <button type="button" key={ph.id} className={`bg-tile bg-photo ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => pickPhoto(ph)} title={t(ph.title)} aria-label={t(ph.title)}>
                    <img src={`images/verse-bg/${ph.thumb}`} alt="" loading="lazy" />
                  </button>
                );
              })}
            </div>
            {!!s.bgImage && (
              <section className="ap-card">
                <Range id="set-bg-show" label={t('Картинку видно')} value={100 - (s.bgVeil ?? 72)} min={5} max={70} step={1} onChange={(v) => set({ bgVeil: 100 - v })} word={(v) => `${v}%`} />
                <Range id="set-bg-blur" label={t('Размытие')} value={s.bgBlur || 0} min={0} max={20} step={1} onChange={(bgBlur) => set({ bgBlur })} word={BLUR_W} />
              </section>
            )}
            <p className="field-hint">{t('Картинка хранится только на этом устройстве.')}</p>
          </>
        )}

        {block === 'colors' && (
          <>
            <Live s={s} bar head sn colors short />
            <ColorPick id="sw-accent" label={t('Акцент интерфейса')} value={eff.accent} base={base.accent} changed={!!over.accent} list={ACCENTS} onPick={(v) => setColor('accent', v)} onReset={() => resetColor('accent')} onLive={liveFor('accent')} />
            <ColorPick
              id="sw-bar"
              label={t('Верхняя панель')}
              value={eff.bar}
              base={base.bar}
              changed={!!over.bar}
              list={BARS}
              onPick={(v) => set({ colorOverrides: { ...over, bar: v, barText: isLight(v) ? '#1d1c1a' : '#f3f1ec' } })}
              onReset={() => resetColor('bar', 'barText')}
              onLive={liveFor('bar')}
            />
            <div className="field">
              <span className="field-label">{t('Цвета выделений')}</span>
              <p className="field-hint">{t('Дайте цветам названия — например, «Обетования», «Вопросы».')}</p>
              <div className="hl-labels">
                {HL_COLORS.map((c) => (
                  <label key={c.id} className="hl-label-row" htmlFor={`hl-${c.id}`}>
                    <span className="hl-swatch" style={{ background: c.css }} />
                    <input id={`hl-${c.id}`} value={hlLabels[c.id] || ''} placeholder={t(c.name)} aria-label={t(c.name)} onChange={(e) => setHlLabels((l) => ({ ...l, [c.id]: e.target.value }))} autoComplete="off" />
                  </label>
                ))}
              </div>
            </div>
            <Fold title={t('Тонкая настройка цветов')} id="set-colors-more">
              <div className="color-list">
                {COLOR_KEYS.filter(([k]) => k !== 'strong' && k !== 'heading').map(([k, label]) => (
                  <ColorRow key={k} id={`c-${k}`} label={t(label)} value={eff[k]} changed={!!over[k]} onChange={(v) => setColor(k, v)} onReset={() => resetColor(k)} onLive={liveFor(k)} />
                ))}
              </div>
            </Fold>
            {Object.keys(over).length > 0 && (
              <button className="btn ap-wide btn-block" onClick={() => set({ colorOverrides: {} })}>
                <RotateCcw size={15} /> {t('Все цвета — как в теме')}
              </button>
            )}
          </>
        )}

        {block === 'ui' && (
          <>
            <Live s={s} bar ui noText />
            <section className="ap-card">
              <h3 className="ap-card-title">{t('В тексте')}</h3>
              <Switch id="set-xr" checked={s.showXrefButtons} onChange={(showXrefButtons) => set({ showXrefButtons })} label={t('Кнопки параллельных мест')} hint={t('Число после стиха — сколько у него параллельных мест')} />
              <Switch id="set-il" checked={s.showIllustrations !== false} onChange={(showIllustrations) => set({ showIllustrations })} label={t('Значки иллюстраций у стихов')} />
              <Switch id="set-focus" checked={s.focusMode} onChange={(focusMode) => set({ focusMode })} label={t('Режим чтения')} hint={t('Без кнопок в тексте, панель прячется при прокрутке')} />
            </section>
            <section className="ap-card">
              <h3 className="ap-card-title">{t('Меню и панели')}</h3>
              <Range id="set-uifs" label={t('Шрифт меню и окон')} big value={s.uiFontSize} min={13} max={20} step={1} onChange={(uiFontSize) => set({ uiFontSize })} word={SIZE_W(14, 16)} />
              <Range id="set-barh" label={t('Высота верхней панели')} value={s.barHeight} min={44} max={72} step={2} onChange={(barHeight) => set({ barHeight })} word={BAR_W} />
              <Switch id="set-anim" checked={s.animations} onChange={(animations) => set({ animations })} label={t('Анимации')} />
            </section>
            <section className="ap-card">
              <Segmented
                id="set-split"
                label={t('Разделённый экран')}
                value={s.splitLayout}
                onChange={(splitLayout) => set({ splitLayout })}
                options={[
                  ['auto', t('Авто')],
                  ['columns', <><Columns2 size={17} aria-hidden="true" /> {t('Рядом')}</>, t('Рядом')],
                  ['rows', <><Rows2 size={17} aria-hidden="true" /> {t('Друг над другом')}</>, t('Друг над другом')],
                ]}
              />
            </section>
          </>
        )}

        {block === 'comments' && (
          <>
            {/* Размер текста в окне комментариев — с образцом */}
            <section className="ap-card">
              <p className="commentary-text cm-sample" style={{ fontSize: `${s.commentaryFontSize}px` }}>
                {t('Так выглядит текст комментария.')}
              </p>
              <Range id="set-cm-size" label={t('Размер текста')} big value={s.commentaryFontSize} min={14} max={32} step={1} onChange={(commentaryFontSize) => set({ commentaryFontSize })} word={(v) => `${v} px`} />
            </section>
            <h4 className="ap-sub">{t('Комментарии в тексте')}</h4>
            <p className="field-hint">{t('Отмеченные видны после стиха. Остальные — зажмите стих → «Комментарии».')}</p>
            <section className="ap-card">
              {commentaries.map((m) => (
                <Switch
                  key={m.id}
                  id={`cm-${m.id}`}
                  checked={!s.inlineCommentaries || s.inlineCommentaries.includes(m.id)}
                  onChange={(on) => {
                    const cur = s.inlineCommentaries || commentaries.map((x) => x.id);
                    set({ inlineCommentaries: on ? [...new Set([...cur, m.id])] : cur.filter((x) => x !== m.id) });
                  }}
                  label={m.name}
                  hint={m.title}
                />
              ))}
            </section>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
