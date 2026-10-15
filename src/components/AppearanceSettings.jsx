// Настройки оформления — все изменения применяются сразу через CSS-переменные.
import React from 'react';
import { RotateCcw } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { THEMES, FONTS, ensureFont } from '../core/settings.js';
import { Segmented, Slider, Switch, Hint } from './ui.jsx';
import { HL_COLORS } from '../core/highlights.js';

function ColorField({ id, label, value, onChange }) {
  return (
    <label className="field color-field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <span className="color-input">
        <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        <span className="mono small">{value}</span>
      </span>
    </label>
  );
}

export default function AppearanceSettings({ onClose }) {
  const { settings: s, setSettings: set, resetSettings, themeName, modules, hlLabels, setHlLabels } = useApp();
  const commentaries = modules.filter((m) => m.type === 'commentary' && m.enabled !== false);
  const colorsFromTheme = () => {
    const t = THEMES[themeName];
    set({ customColors: true, colors: { bg: t.bg, text: t.text, accent: t.accent, panel: t.panel } });
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
      <div className="preview-card" aria-hidden="true">
        <span className="pv-num">16</span>Ибо так возлюбил Бог мир, что отдал Сына Своего Единородного, дабы всякий верующий в Него, не погиб, но имел жизнь вечную.
        <span className="pv-xr">[⇅ 5]</span>
      </div>

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
        <Slider id="set-size" label="Размер шрифта" value={s.fontSize} min={13} max={32} step={1} onChange={(fontSize) => set({ fontSize })} format={(v) => `${v} px`} />
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
        <Switch id="set-vn" checked={s.showVerseNumbers} onChange={(showVerseNumbers) => set({ showVerseNumbers })} label="Номера стихов" />
        <Switch id="set-book" checked={s.bookMode} onChange={(bookMode) => set({ bookMode })} label="Как книга" hint="Сплошной текст абзацами по разделам, без номеров стихов, кнопок и пометок — для долгого чтения" />
        <Switch id="set-cont" checked={s.continuousVerses} onChange={(continuousVerses) => set({ continuousVerses })} label="Стихи сплошным текстом" hint="Без перевода строки после каждого стиха" />
        <Switch id="set-head" checked={s.showHeadings} onChange={(showHeadings) => set({ showHeadings })} label="Заголовки разделов" />
        <Switch id="set-strong" checked={s.showStrongs} onChange={(showStrongs) => set({ showStrongs })} label="Номера Стронга в тексте" hint="Только для размеченных переводов, например RST+" />
      </section>

      <section className="settings-group">
        <h4>Интерфейс</h4>
        <Switch id="set-xr" checked={s.showXrefButtons} onChange={(showXrefButtons) => set({ showXrefButtons })} label="Кнопки параллельных мест" />
        <Switch id="set-compact" checked={s.compactToolbar} onChange={(compactToolbar) => set({ compactToolbar })} label="Компактная верхняя панель" />
        <Switch id="set-focus" checked={s.focusMode} onChange={(focusMode) => set({ focusMode })} label="Режим чтения" hint="Прячет кнопки в тексте, панель скрывается при прокрутке вниз" />
        <Switch id="set-anim" checked={s.animations} onChange={(animations) => set({ animations })} label="Анимации" />
        <Slider id="set-radius" label="Закругления" value={s.radius} min={0} max={24} step={1} onChange={(radius) => set({ radius })} format={(v) => `${v} px`} />
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
        <h4>Свои цвета</h4>
        <Switch id="set-custom" checked={s.customColors} onChange={(v) => (v ? colorsFromTheme() : set({ customColors: false }))} label="Использовать свои цвета" hint="Поверх выбранной темы" />
        {s.customColors && (
          <div className="color-grid">
            <ColorField id="c-bg" label="Фон" value={s.colors.bg} onChange={(bg) => set({ colors: { ...s.colors, bg } })} />
            <ColorField id="c-text" label="Текст" value={s.colors.text} onChange={(text) => set({ colors: { ...s.colors, text } })} />
            <ColorField id="c-accent" label="Акцент" value={s.colors.accent} onChange={(accent) => set({ colors: { ...s.colors, accent } })} />
            <ColorField id="c-panel" label="Панели" value={s.colors.panel} onChange={(panel) => set({ colors: { ...s.colors, panel } })} />
          </div>
        )}
      </section>
    </BottomSheet>
  );
}
