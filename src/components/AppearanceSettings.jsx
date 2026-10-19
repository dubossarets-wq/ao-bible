// Настройки оформления — все изменения применяются сразу через CSS-переменные.
import React, { useState } from 'react';
import { RotateCcw, ChevronRight, Image as ImageIcon, Upload, Trash2, SunMoon, AlignLeft, Type, Hash, Superscript, Heading, PanelTop, MessageSquareText, Highlighter, Palette } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { FONTS, ensureFont, COLOR_KEYS, themeColors, THEMES } from '../core/settings.js';
import { Segmented, Slider, Switch } from './ui.jsx';
import { HL_COLORS } from '../core/highlights.js';
import { saveBg, clearBg } from '../core/userBg.js';
import { t, N_ } from '../core/i18n.js';
import { formatRef } from '../core/books.js';

// Готовые цвета для быстрого выбора акцента и верхней панели
const ACCENTS = ['#8c5e28', '#b4412f', '#c2410c', '#a16207', '#3f7a4a', '#0f766e', '#2563eb', '#4f46e5', '#7c3aed', '#be185d'];
const BARS = ['#38363a', '#0c0c0d', '#4a3d2f', '#1e3a5f', '#14532d', '#5b2333', '#ffffff', '#f3f1ec'];

// Светлый ли цвет — чтобы подобрать к панели читаемые надписи
const isLight = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 160;
};

// Строка цвета: образец, выбор своего цвета, «вернуть цвет темы»
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

// Что показать в образце для каждого цвета
const LIVE = {
  strong: { sn: true, num: false, view: 'flow' },
  heading: { head: true, view: 'flow' },
  bar: { bar: true, num: false, view: 'flow' },
  barText: { bar: true, num: false, view: 'flow' },
  verseNum: {},
};

function Swatches({ id, label, list, value, onPick }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="swatches" role="group" aria-label={label}>
        {list.map((c) => (
          <button key={c} id={`${id}-${c.slice(1)}`} className={`swatch ${value?.toLowerCase() === c ? 'on' : ''}`} style={{ background: c }} onClick={() => onPick(c)} aria-label={c} />
        ))}
      </div>
    </div>
  );
}

// Образец под разделом настроек: показывает ровно то, что меняет раздел, и обновляется сразу
// Быт 1:1–2 с заголовком, который стоит над ними в синодальном тексте; в других языках интерфейса — классический
// перевод на этом языке. В первом стихе номер Стронга — {номер} сразу после слова (порядок слов у языков разный).
const V1 = () => t('В начале{7225} сотворил{1254} Бог{430} небо{8064} и{853} землю.{776}');
const V2 = () => t('Земля же была безвидна и пуста, и тьма над бездною, и Дух Божий носился над водою.');

export function Sample({ s: real, bar, head, num, sn, ui, colors, live, view = textView(real) }) {
  // live — образец при выборе цвета: номера и заголовки видны всегда
  const s = live ? { ...real, showStrongs: true, showHeadings: true } : real;
  const showNum = num !== false && s.showVerseNumbers && view !== 'book';
  // «слово{номер} слово{номер}…» → кусочки текста и номера Стронга после слов
  const v1 = V1()
    .split(/\{(\d+)\}/)
    .map((part, i) =>
      i % 2 ? sn && <span key={i} className={`pv-sn ${s.showStrongs ? '' : 'off'}`}>{part}</span> : <React.Fragment key={i}>{part}</React.Fragment>
    );
  const verses =
    view === 'verses' ? (
      <>
        <span className="pv-verse">
          {showNum && <span className="pv-num">1</span>}
          {v1}
        </span>
        <span className="pv-verse">
          {showNum && <span className="pv-num">2</span>}
          {V2()}
        </span>
      </>
    ) : (
      <span className="pv-verse">
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
        {head && <span className={`pv-head ${s.showHeadings ? '' : 'off'}`}>{t('Сотворение неба и земли')}</span>}
        {verses}
        {sn && !s.showStrongs && <span className="pv-note">{t('Номера Стронга в тексте выключены — так они будут выглядеть, если включить')}</span>}
        {head && !s.showHeadings && <span className="pv-note">{t('Заголовки выключены — так они будут выглядеть, если включить')}</span>}
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

// Вид текста — один выбор вместо трёх переключателей (хранится в прежних полях, чтобы ничего не сбилось)
export const textView = (s) => (s.bookMode ? 'book' : s.continuousVerses ? 'flow' : 'verses');

// Блоки оформления: на первом экране — их список с текущими значениями, по нажатию — настройки одного блока
const BLOCKS = [
  ['theme', SunMoon, N_('Тема')],
  ['bg', ImageIcon, N_('Фон')],
  ['view', AlignLeft, N_('Вид текста')],
  ['text', Type, N_('Шрифт и размер')],
  ['verseNums', Hash, N_('Номера стихов')],
  ['strongs', Superscript, N_('Номера Стронга')],
  ['headings', Heading, N_('Заголовки разделов')],
  ['ui', PanelTop, N_('Кнопки и панели')],
  ['comments', MessageSquareText, N_('Комментарии в тексте')],
  ['hl', Highlighter, N_('Цвета выделений')],
  ['colors', Palette, N_('Цвета интерфейса')],
];
const THEME_NAMES = { ...Object.fromEntries(Object.entries(THEMES).map(([k, v]) => [k, v.label])), auto: N_('Как в системе') };

// Плитка темы: маленький образец — панель, страница, строки текста и кнопка цвета акцента
function ThemeTile({ id, on, onPick }) {
  const th = THEMES[id] || THEMES.light;
  const dark = THEMES.dark;
  const half = id === 'auto';
  return (
    <button className={`theme-tile ${on ? 'on' : ''}`} onClick={onPick} aria-pressed={on}>
      <span className="theme-swatch" style={{ background: half ? `linear-gradient(135deg, ${THEMES.light.bg} 50%, ${dark.bg} 50%)` : th.bg, borderColor: th.line }} aria-hidden="true">
        <span className="ts-bar" style={{ background: half ? `linear-gradient(90deg, ${THEMES.light.bar} 50%, ${dark.bar} 50%)` : th.bar }} />
        <span className="ts-line" style={{ background: half ? THEMES.light.text : th.text }} />
        <span className="ts-line short" style={{ background: half ? dark.text : th.muted }} />
        <span className="ts-dot" style={{ background: th.accent }} />
      </span>
      <span className="theme-name">{t(THEME_NAMES[id])}</span>
    </button>
  );
}
const VIEW_NAMES = { verses: N_('По стихам'), flow: N_('Сплошной'), book: N_('Как книга') };
const POS_NAMES = { sup: N_('Над строкой'), inline: N_('В строке'), sub: N_('Под строкой') };

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
  const { settings: s, setSettings: set, resetSettings, themeName, modules, hlLabels, setHlLabels, toast } = useApp();
  const fileRef = React.useRef(null);
  const pickBg = async (file) => {
    if (!file) return;
    try {
      await saveBg(file);
      set({ bgImage: Date.now() });
    } catch {
      toast(t('Не удалось открыть картинку'), 'error');
    }
  };
  const commentaries = modules.filter((m) => m.type === 'commentary' && m.enabled !== false);
  const eff = themeColors(s, themeName); // цвета, которые сейчас на экране
  const [live, setLive] = React.useState(null); // какой цвет сейчас выбирают в палитре
  const liveFor = (k) => (on) => setLive((cur) => (on ? k : cur === k ? null : cur));
  const over = s.colorOverrides || {};
  const setColor = (k, v) => set({ colorOverrides: { ...over, [k]: v } });
  const resetColor = (k) => {
    const { [k]: _, ...rest } = over;
    set({ colorOverrides: rest });
  };
  const [block, setBlock] = useState(payload?.block || null);
  const onOff = (on, more) => (on ? [t('вкл'), more].filter(Boolean).join(' · ') : t('выкл'));
  const inlineCount = s.inlineCommentaries ? commentaries.filter((m) => s.inlineCommentaries.includes(m.id)).length : commentaries.length;

  // В строке блока — текущее значение, чтобы не открывать блок ради проверки
  const subs = {
    theme: t(THEME_NAMES[s.theme] || THEME_NAMES.light),
    bg: s.bgImage ? t('Своя картинка') : t('Без картинки'),
    view: t(VIEW_NAMES[textView(s)]),
    text: `${t(FONTS[s.fontFamily]?.label || '')} · ${s.fontSize} px`,
    verseNums: onOff(s.showVerseNumbers, t(POS_NAMES[s.verseNumPos])),
    strongs: onOff(s.showStrongs, t(POS_NAMES[s.strongPos])),
    headings: onOff(s.showHeadings),
    ui: [s.focusMode && t('Режим чтения'), t('Кнопки в тексте, меню, верхняя панель')].filter(Boolean).join(' · '),
    comments: t('{n} из {total}', { n: inlineCount, total: commentaries.length }),
    hl: HL_COLORS.map((c) => hlLabels[c.id] || t(c.name)).join(', '),
    colors: Object.keys(over).length ? t('Свои цвета: {n}', { n: Object.keys(over).length }) : t('Как в теме'),
  };
  const shown = BLOCKS.filter(([id]) => id !== 'comments' || commentaries.length > 0);
  const cur = BLOCKS.find(([id]) => id === block);

  return (
    <BottomSheet
      title={cur ? t(cur[2]) : t('Оформление')}
      onClose={onClose}
      onBack={cur ? () => setBlock(null) : null}
      initial={1}
      headerExtra={
        !cur && (
          <button className="btn small" onClick={resetSettings} title={t('Восстановить стандартные настройки')}>
            <RotateCcw size={15} /> {t('Сбросить')}
          </button>
        )
      }
    >
      {live && (
        <div className="live-sample" aria-hidden="true">
          <Sample s={s} live {...(LIVE[live] || { bar: true, head: true, sn: true, ui: true })} />
        </div>
      )}

      {!cur && (
        <div className="pref-list-main">
          {shown.map(([id, icon, title]) => (
            <BlockRow key={id} icon={icon} title={t(title)} sub={subs[id]} onClick={() => setBlock(id)} />
          ))}
        </div>
      )}

      {block === 'theme' && (
        <section className="settings-group">
          <div className="theme-grid" role="group" aria-label={t('Тема')}>
            {Object.keys(THEME_NAMES).map((k) => (
              <ThemeTile key={k} id={k} on={s.theme === k} onPick={() => set({ theme: k })} />
            ))}
          </div>
          <Sample s={s} bar head num sn />
        </section>
      )}

      {block === 'bg' && (
        <section className="settings-group">
          <span className="bg-preview" aria-hidden="true">
            <span>{t('В начале сотворил Бог небо и землю.')}</span>
          </span>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => (pickBg(e.target.files?.[0]), (e.target.value = ''))} />
          <div className="row-actions">
            <button className="btn primary" onClick={() => fileRef.current?.click()}>
              <Upload size={16} /> {s.bgImage ? t('Заменить картинку') : t('Выбрать картинку')}
            </button>
            {!!s.bgImage && (
              <button className="btn" onClick={() => (clearBg(), set({ bgImage: 0 }))}>
                <Trash2 size={16} /> {t('Убрать')}
              </button>
            )}
          </div>
          {!!s.bgImage && (
            <>
              <Slider id="set-bg-show" label={t('Картинку видно')} value={100 - (s.bgVeil ?? 72)} min={5} max={70} step={1} onChange={(v) => set({ bgVeil: 100 - v })} format={(v) => `${v}%`} />
              <Slider id="set-bg-blur" label={t('Размытие')} value={s.bgBlur || 0} min={0} max={20} step={1} onChange={(bgBlur) => set({ bgBlur })} format={(v) => `${v} px`} />
            </>
          )}
          <p className="field-hint">{t('Картинка хранится только на этом устройстве.')}</p>
        </section>
      )}

      {block === 'view' && (
        <section className="settings-group">
          <p className="field-hint">{t('«По стихам» — каждый стих с новой строки. «Сплошной» — стихи подряд, с номерами. «Как книга» — абзацами по разделам, без номеров и кнопок, для долгого чтения.')}</p>
          <Segmented
            id="set-view"
            value={textView(s)}
            onChange={(v) => set({ bookMode: v === 'book', continuousVerses: v === 'flow' })}
            options={Object.entries(VIEW_NAMES).map(([k, v]) => [k, t(v)])}
          />
          <Sample s={s} />
        </section>
      )}

      {block === 'text' && (
        <section className="settings-group">
          <Sample s={s} head />
          <label className="field" htmlFor="set-font">
            <span className="field-label">{t('Шрифт')}</span>
            <select
              id="set-font"
              value={s.fontFamily}
              onChange={(e) => {
                ensureFont(e.target.value);
                set({ fontFamily: e.target.value });
              }}
            >
              {Object.entries(FONTS).map(([k, f]) => (
                <option key={k} value={k}>
                  {t(f.label)}
                </option>
              ))}
            </select>
          </label>
          <Slider id="set-size" label={t('Размер шрифта')} value={s.fontSize} min={13} max={40} step={1} onChange={(fontSize) => set({ fontSize })} format={(v) => `${v} px`} />
          <Slider id="set-weight" label={t('Толщина')} value={s.fontWeight} min={300} max={700} step={100} onChange={(fontWeight) => set({ fontWeight })} format={(v) => ({ 300: t('тонкий'), 400: t('обычный'), 500: t('средний'), 600: t('полужирный'), 700: t('жирный') })[v]} />
          <Slider id="set-lh" label={t('Межстрочный интервал')} value={s.lineHeight} min={1.1} max={2.2} step={0.05} onChange={(lineHeight) => set({ lineHeight })} format={(v) => v.toFixed(2)} />
          <Slider id="set-vgap" label={t('Расстояние между стихами')} value={s.verseSpacing} min={0} max={1.6} step={0.05} onChange={(verseSpacing) => set({ verseSpacing })} format={(v) => `${v.toFixed(2)} em`} />
          <Slider id="set-width" label={t('Ширина текста')} value={s.textWidth} min={24} max={80} step={1} onChange={(textWidth) => set({ textWidth })} format={(v) => `${v} em`} />
          <Slider id="set-ch" label={t('Размер заголовков глав')} value={s.chapterTitleSize} min={1.1} max={3.2} step={0.1} onChange={(chapterTitleSize) => set({ chapterTitleSize })} format={(v) => `${v.toFixed(1)} em`} />
          <Segmented
            id="set-align"
            label={t('Выравнивание')}
            value={s.textAlign}
            onChange={(textAlign) => set({ textAlign })}
            options={[
              ['left', t('По левому краю')],
              ['justify', t('По ширине')],
            ]}
          />
        </section>
      )}

      {block === 'verseNums' && (
        <section className="settings-group">
          <Sample s={s} />
          <Switch id="set-vn" checked={s.showVerseNumbers} onChange={(showVerseNumbers) => set({ showVerseNumbers })} label={t('Номера стихов')} />
          <Slider id="set-vn-size" label={t('Размер')} value={s.verseNumSize} min={0.4} max={1.2} step={0.05} onChange={(verseNumSize) => set({ verseNumSize })} format={(v) => `${Math.round(v * 100)}%`} />
          <Segmented
            id="set-vn-pos"
            label={t('Положение')}
            value={s.verseNumPos}
            onChange={(verseNumPos) => set({ verseNumPos })}
            options={[
              ['sup', t('Над строкой')],
              ['inline', t('В строке')],
            ]}
          />
        </section>
      )}

      {block === 'strongs' && (
        <section className="settings-group">
          <Sample s={s} sn num={false} view="flow" />
          <Switch id="set-strong" checked={s.showStrongs} onChange={(showStrongs) => set({ showStrongs })} label={t('Номера Стронга в тексте')} hint={t('Только для размеченных переводов, например RST+')} />
          <Slider id="set-sn-size" label={t('Размер')} value={s.strongSize} min={0.35} max={1} step={0.05} onChange={(strongSize) => set({ strongSize })} format={(v) => `${Math.round(v * 100)}%`} />
          <Segmented
            id="set-sn-pos"
            label={t('Положение')}
            value={s.strongPos}
            onChange={(strongPos) => set({ strongPos })}
            options={[
              ['sup', t('Над строкой')],
              ['inline', t('В строке')],
              ['sub', t('Под строкой')],
            ]}
          />
          <ColorRow id="c-strong" label={t('Цвет')} value={eff.strong} changed={!!over.strong} onChange={(v) => setColor('strong', v)} onReset={() => resetColor('strong')} onLive={liveFor('strong')} />
        </section>
      )}

      {block === 'headings' && (
        <section className="settings-group">
          <Sample s={s} head view="flow" />
          <Switch id="set-head" checked={s.showHeadings} onChange={(showHeadings) => set({ showHeadings })} label={t('Заголовки разделов')} />
          <Slider id="set-head-size" label={t('Размер')} value={s.headingSize} min={0.6} max={1.4} step={0.05} onChange={(headingSize) => set({ headingSize })} format={(v) => `${Math.round(v * 100)}%`} />
          <ColorRow id="c-heading" label={t('Цвет')} value={eff.heading} changed={!!over.heading} onChange={(v) => setColor('heading', v)} onReset={() => resetColor('heading')} onLive={liveFor('heading')} />
        </section>
      )}

      {block === 'ui' && (
        <section className="settings-group">
          <Switch id="set-xr" checked={s.showXrefButtons} onChange={(showXrefButtons) => set({ showXrefButtons })} label={t('Кнопки параллельных мест')} />
          <Switch id="set-il" checked={s.showIllustrations !== false} onChange={(showIllustrations) => set({ showIllustrations })} label={t('Значки иллюстраций у стихов')} hint={t('Картинка в конце стиха открывает иллюстрацию к нему')} />
          <Switch id="set-focus" checked={s.focusMode} onChange={(focusMode) => set({ focusMode })} label={t('Режим чтения')} hint={t('Прячет кнопки в тексте, панель скрывается при прокрутке вниз')} />
          <Switch id="set-anim" checked={s.animations} onChange={(animations) => set({ animations })} label={t('Анимации')} />
          <Slider id="set-uifs" label={t('Размер шрифта меню и окон')} value={s.uiFontSize} min={13} max={20} step={1} onChange={(uiFontSize) => set({ uiFontSize })} format={(v) => `${v} px`} />
          <Slider id="set-barh" label={t('Высота верхней панели')} value={s.barHeight} min={44} max={72} step={2} onChange={(barHeight) => set({ barHeight })} format={(v) => `${v} px`} />
          <Segmented
            id="set-split"
            label={t('Разделённый экран')}
            value={s.splitLayout}
            onChange={(splitLayout) => set({ splitLayout })}
            options={[
              ['auto', t('Авто')],
              ['columns', t('Рядом')],
              ['rows', t('Друг над другом')],
            ]}
          />
          <Sample s={s} bar ui num={false} view="flow" />
        </section>
      )}

      {block === 'comments' && (
        <section className="settings-group">
          <p className="field-hint">{t('Отмеченные подписываются после стиха. Остальные открываются долгим нажатием на стих → «Комментарии».')}</p>
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
      )}

      {block === 'hl' && (
        <section className="settings-group">
          <p className="field-hint">{t('Подпишите цвета — например, «Обетования», «Вопросы». Подписи видны в палитре и в списке выделений.')}</p>
          <div className="hl-labels">
            {HL_COLORS.map((c) => (
              <label key={c.id} className="hl-label-row" htmlFor={`hl-${c.id}`}>
                <span className="hl-swatch" style={{ background: c.css }} />
                <input id={`hl-${c.id}`} value={hlLabels[c.id] || ''} placeholder={t(c.name)} onChange={(e) => setHlLabels((l) => ({ ...l, [c.id]: e.target.value }))} autoComplete="off" />
              </label>
            ))}
          </div>
        </section>
      )}

      {block === 'colors' && (
        <section className="settings-group">
          <p className="field-hint">{t('Любой цвет можно поменять поверх выбранной темы. Стрелка справа возвращает цвет темы.')}</p>
          <Sample s={s} bar head sn colors />
          <Swatches id="sw-accent" label={t('Акцент интерфейса')} list={ACCENTS} value={eff.accent} onPick={(v) => setColor('accent', v)} />
          <Swatches id="sw-bar" label={t('Верхняя панель')} list={BARS} value={eff.bar} onPick={(v) => set({ colorOverrides: { ...over, bar: v, barText: isLight(v) ? '#1d1c1a' : '#f3f1ec' } })} />
          <div className="color-list">
            {COLOR_KEYS.filter(([k]) => k !== 'strong' && k !== 'heading').map(([k, label]) => (
              <ColorRow key={k} id={`c-${k}`} label={t(label)} value={eff[k]} changed={!!over[k]} onChange={(v) => setColor(k, v)} onReset={() => resetColor(k)} onLive={liveFor(k)} />
            ))}
          </div>
          {Object.keys(over).length > 0 && (
            <button className="btn" onClick={() => set({ colorOverrides: {} })}>
              <RotateCcw size={15} /> {t('Все цвета — как в теме')}
            </button>
          )}
        </section>
      )}
    </BottomSheet>
  );
}
