// Настройки оформления — все изменения применяются сразу через CSS-переменные.
import React from 'react';
import { RotateCcw } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { FONTS, ensureFont, COLOR_KEYS, themeColors } from '../core/settings.js';
import { Segmented, Slider, Switch, Hint } from './ui.jsx';
import { HL_COLORS } from '../core/highlights.js';

// Готовые цвета для быстрого выбора акцента и верхней панели
const ACCENTS = ['#9a6a2f', '#b4412f', '#c2410c', '#a16207', '#3f7a4a', '#0f766e', '#2563eb', '#4f46e5', '#7c3aed', '#be185d'];
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
      <button className="icon-btn" onClick={onReset} aria-label={`${label}: цвет темы`} title="Вернуть цвет темы">
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
// Быт 1:1–2 с заголовком, который стоит над ними в синодальном тексте
const V1 = [['В', null], ['начале', '7225'], ['сотворил', '1254'], ['Бог', '430'], ['небо', '8064'], ['и', '853'], ['землю.', '776']];
const V2 = 'Земля же была безвидна и пуста, и тьма над бездною, и Дух Божий носился над водою.';

function Sample({ s: real, bar, head, num, sn, ui, colors, live, view = textView(real) }) {
  // live — образец при выборе цвета: номера и заголовки видны всегда
  const s = live ? { ...real, showStrongs: true, showHeadings: true } : real;
  const showNum = num !== false && s.showVerseNumbers && view !== 'book';
  const v1 = V1.map(([w, n], i) => (
    <React.Fragment key={i}>
      {i ? ' ' : ''}
      {w}
      {sn && n && <span className={`pv-sn ${s.showStrongs ? '' : 'off'}`}>{n}</span>}
    </React.Fragment>
  ));
  const verses =
    view === 'verses' ? (
      <>
        <span className="pv-verse">
          {showNum && <span className="pv-num">1</span>}
          {v1}
        </span>
        <span className="pv-verse">
          {showNum && <span className="pv-num">2</span>}
          {V2}
        </span>
      </>
    ) : (
      <span className="pv-verse">
        {showNum && <span className="pv-num">1</span>}
        {v1} {showNum && <span className="pv-num">2</span>}
        {V2}
      </span>
    );
  return (
    <div className={`preview-card sample ${colors ? 'colors' : ''}`} aria-hidden="true">
      {bar && (
        <div className="pv-bar">
          <span className="pv-pill">RST+</span> Быт. 1:1
        </div>
      )}
      <div className="pv-body">
        {head && <span className={`pv-head ${s.showHeadings ? '' : 'off'}`}>Сотворение неба и земли</span>}
        {verses}
        {sn && !s.showStrongs && <span className="pv-note">Номера Стронга в тексте выключены — так они будут выглядеть, если включить</span>}
        {head && !s.showHeadings && <span className="pv-note">Заголовки выключены — так они будут выглядеть, если включить</span>}
        {(ui || colors) && (
          <span className="pv-ui">
            <span className="pv-btn">Кнопка</span>
            <span className="pv-card">
              Окно или карточка<span className="pv-muted">бледный текст</span>
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

// Вид текста — один выбор вместо трёх переключателей (хранится в прежних полях, чтобы ничего не сбилось)
export const textView = (s) => (s.bookMode ? 'book' : s.continuousVerses ? 'flow' : 'verses');

export default function AppearanceSettings({ onClose }) {
  const { settings: s, setSettings: set, resetSettings, themeName, modules, hlLabels, setHlLabels } = useApp();
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

  return (
    <BottomSheet
      title="Оформление"
      onClose={onClose}
      initial={1}
      headerExtra={
        <button className="btn small" onClick={resetSettings} title="Восстановить стандартные настройки">
          <RotateCcw size={15} /> Сбросить
        </button>
      }
    >
      {live && (
        <div className="live-sample" aria-hidden="true">
          <Sample s={s} live {...(LIVE[live] || { bar: true, head: true, sn: true, ui: true })} />
        </div>
      )}
      <section className="settings-group">
        <h4>Тема</h4>
        <Segmented
          id="set-theme"
          value={s.theme}
          onChange={(theme) => set({ theme })}
          options={[
            ['light', 'Светлая'],
            ['dark', 'Тёмная'],
            ['sepia', 'Сепия'],
            ['auto', 'Как в системе'],
          ]}
        />
        <Sample s={s} bar head num sn />
      </section>

      <section className="settings-group">
        <h4>
          Вид текста <Hint>«По стихам» — каждый стих с новой строки. «Сплошной» — стихи подряд, с номерами. «Как книга» — абзацами по разделам, без номеров и кнопок, для долгого чтения.</Hint>
        </h4>
        <Segmented
          id="set-view"
          value={textView(s)}
          onChange={(v) => set({ bookMode: v === 'book', continuousVerses: v === 'flow' })}
          options={[
            ['verses', 'По стихам'],
            ['flow', 'Сплошной'],
            ['book', 'Как книга'],
          ]}
        />
        <Sample s={s} />
      </section>

      <section className="settings-group">
        <h4>Текст</h4>
        <label className="field" htmlFor="set-font">
          <span className="field-label">Шрифт</span>
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
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <Slider id="set-size" label="Размер шрифта" value={s.fontSize} min={13} max={40} step={1} onChange={(fontSize) => set({ fontSize })} format={(v) => `${v} px`} />
        <Slider id="set-weight" label="Толщина" value={s.fontWeight} min={300} max={700} step={100} onChange={(fontWeight) => set({ fontWeight })} format={(v) => ({ 300: 'тонкий', 400: 'обычный', 500: 'средний', 600: 'полужирный', 700: 'жирный' })[v]} />
        <Slider id="set-lh" label="Межстрочный интервал" value={s.lineHeight} min={1.1} max={2.2} step={0.05} onChange={(lineHeight) => set({ lineHeight })} format={(v) => v.toFixed(2)} />
        <Slider id="set-vgap" label="Расстояние между стихами" value={s.verseSpacing} min={0} max={1.6} step={0.05} onChange={(verseSpacing) => set({ verseSpacing })} format={(v) => `${v.toFixed(2)} em`} />
        <Slider id="set-width" label="Ширина текста" value={s.textWidth} min={24} max={80} step={1} onChange={(textWidth) => set({ textWidth })} format={(v) => `${v} em`} />
        <Slider id="set-ch" label="Размер заголовков глав" value={s.chapterTitleSize} min={1.1} max={3.2} step={0.1} onChange={(chapterTitleSize) => set({ chapterTitleSize })} format={(v) => `${v.toFixed(1)} em`} />
        <Segmented
          id="set-align"
          label="Выравнивание"
          value={s.textAlign}
          onChange={(textAlign) => set({ textAlign })}
          options={[
            ['left', 'По левому краю'],
            ['justify', 'По ширине'],
          ]}
        />
        <Sample s={s} head />
      </section>

      <section className="settings-group">
        <h4>Номера стихов</h4>
        <Switch id="set-vn" checked={s.showVerseNumbers} onChange={(showVerseNumbers) => set({ showVerseNumbers })} label="Номера стихов" />
        <Slider id="set-vn-size" label="Размер" value={s.verseNumSize} min={0.4} max={1.2} step={0.05} onChange={(verseNumSize) => set({ verseNumSize })} format={(v) => `${Math.round(v * 100)}%`} />
        <Segmented
          id="set-vn-pos"
          label="Положение"
          value={s.verseNumPos}
          onChange={(verseNumPos) => set({ verseNumPos })}
          options={[
            ['sup', 'Над строкой'],
            ['inline', 'В строке'],
          ]}
        />
        <Sample s={s} />
      </section>

      <section className="settings-group">
        <h4>Номера Стронга</h4>
        <Switch id="set-strong" checked={s.showStrongs} onChange={(showStrongs) => set({ showStrongs })} label="Номера Стронга в тексте" hint="Только для размеченных переводов, например RST+" />
        <Slider id="set-sn-size" label="Размер" value={s.strongSize} min={0.35} max={1} step={0.05} onChange={(strongSize) => set({ strongSize })} format={(v) => `${Math.round(v * 100)}%`} />
        <Segmented
          id="set-sn-pos"
          label="Положение"
          value={s.strongPos}
          onChange={(strongPos) => set({ strongPos })}
          options={[
            ['sup', 'Над строкой'],
            ['inline', 'В строке'],
            ['sub', 'Под строкой'],
          ]}
        />
        <ColorRow id="c-strong" label="Цвет" value={eff.strong} changed={!!over.strong} onChange={(v) => setColor('strong', v)} onReset={() => resetColor('strong')} onLive={liveFor('strong')} />
        <Sample s={s} sn num={false} view="flow" />
      </section>

      <section className="settings-group">
        <h4>Заголовки разделов</h4>
        <Switch id="set-head" checked={s.showHeadings} onChange={(showHeadings) => set({ showHeadings })} label="Заголовки разделов" />
        <Slider id="set-head-size" label="Размер" value={s.headingSize} min={0.6} max={1.4} step={0.05} onChange={(headingSize) => set({ headingSize })} format={(v) => `${Math.round(v * 100)}%`} />
        <ColorRow id="c-heading" label="Цвет" value={eff.heading} changed={!!over.heading} onChange={(v) => setColor('heading', v)} onReset={() => resetColor('heading')} onLive={liveFor('heading')} />
        <Sample s={s} head view="flow" />
      </section>

      <section className="settings-group">
        <h4>Интерфейс</h4>
        <Switch id="set-xr" checked={s.showXrefButtons} onChange={(showXrefButtons) => set({ showXrefButtons })} label="Кнопки параллельных мест" />
        <Switch id="set-il" checked={s.showIllustrations !== false} onChange={(showIllustrations) => set({ showIllustrations })} label="Значки иллюстраций у стихов" hint="Картинка в конце стиха открывает иллюстрацию к нему" />
        <Switch id="set-focus" checked={s.focusMode} onChange={(focusMode) => set({ focusMode })} label="Режим чтения" hint="Прячет кнопки в тексте, панель скрывается при прокрутке вниз" />
        <Switch id="set-anim" checked={s.animations} onChange={(animations) => set({ animations })} label="Анимации" />
        <Slider id="set-uifs" label="Размер шрифта меню и окон" value={s.uiFontSize} min={13} max={20} step={1} onChange={(uiFontSize) => set({ uiFontSize })} format={(v) => `${v} px`} />
        <Slider id="set-barh" label="Высота верхней панели" value={s.barHeight} min={44} max={72} step={2} onChange={(barHeight) => set({ barHeight })} format={(v) => `${v} px`} />
        <Slider id="set-radius" label="Закругления" value={s.radius} min={0} max={99} step={1} onChange={(radius) => set({ radius })} format={(v) => `${v} px`} />
        <Segmented
          id="set-split"
          label="Разделённый экран"
          value={s.splitLayout}
          onChange={(splitLayout) => set({ splitLayout })}
          options={[
            ['auto', 'Авто'],
            ['columns', 'Рядом'],
            ['rows', 'Друг над другом'],
          ]}
        />
        <Sample s={s} bar ui num={false} view="flow" />
      </section>

      {commentaries.length > 0 && (
        <section className="settings-group">
          <h4>
            Комментарии в тексте <Hint>Отмеченные подписываются после стиха. Остальные открываются долгим нажатием на стих → «Комментарии».</Hint>
          </h4>
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

      <section className="settings-group">
        <h4>
          Цвета выделений <Hint>Подпишите цвета — например, «Обетования», «Вопросы». Подписи видны в палитре и в списке выделений.</Hint>
        </h4>
        <div className="hl-labels">
          {HL_COLORS.map((c) => (
            <label key={c.id} className="hl-label-row" htmlFor={`hl-${c.id}`}>
              <span className="hl-swatch" style={{ background: c.css }} />
              <input id={`hl-${c.id}`} value={hlLabels[c.id] || ''} placeholder={c.name} onChange={(e) => setHlLabels((l) => ({ ...l, [c.id]: e.target.value }))} autoComplete="off" />
            </label>
          ))}
        </div>
      </section>

      <section className="settings-group">
        <h4>
          Цвета <Hint>Любой цвет можно поменять поверх выбранной темы. Стрелка справа возвращает цвет темы.</Hint>
        </h4>
        <Swatches id="sw-accent" label="Акцент интерфейса" list={ACCENTS} value={eff.accent} onPick={(v) => setColor('accent', v)} />
        <Swatches id="sw-bar" label="Верхняя панель" list={BARS} value={eff.bar} onPick={(v) => set({ colorOverrides: { ...over, bar: v, barText: isLight(v) ? '#1d1c1a' : '#f3f1ec' } })} />
        <div className="color-list">
          {COLOR_KEYS.filter(([k]) => k !== 'strong' && k !== 'heading').map(([k, label]) => (
            <ColorRow key={k} id={`c-${k}`} label={label} value={eff[k]} changed={!!over[k]} onChange={(v) => setColor(k, v)} onReset={() => resetColor(k)} onLive={liveFor(k)} />
          ))}
        </div>
        {Object.keys(over).length > 0 && (
          <button className="btn" onClick={() => set({ colorOverrides: {} })}>
            <RotateCcw size={15} /> Все цвета — как в теме
          </button>
        )}
        <Sample s={s} bar head sn colors />
      </section>
    </BottomSheet>
  );
}
