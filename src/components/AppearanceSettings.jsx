// Настройки оформления — все изменения применяются сразу через CSS-переменные.
import React from 'react';
import { RotateCcw } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { THEMES, FONTS, ensureFont } from '../core/settings.js';
import { Segmented, Slider, Switch, Hint } from './ui.jsx';
import { HL_COLORS } from '../core/highlights.js';
import { t } from '../core/i18n.js';

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

// Вид текста — один выбор вместо трёх переключателей (хранится в прежних полях, чтобы ничего не сбилось)
export const textView = (s) => (s.bookMode ? 'book' : s.continuousVerses ? 'flow' : 'verses');

export default function AppearanceSettings({ onClose }) {
  const { settings: s, setSettings: set, resetSettings, themeName, modules, hlLabels, setHlLabels } = useApp();
  const commentaries = modules.filter((m) => m.type === 'commentary' && m.enabled !== false);
  const colorsFromTheme = () => {
    const th = THEMES[themeName];
    set({ customColors: true, colors: { bg: th.bg, text: th.text, accent: th.accent, panel: th.panel } });
  };

  return (
    <BottomSheet
      title={t('Оформление')}
      onClose={onClose}
      initial={1}
      headerExtra={
        <button className="btn small" onClick={resetSettings} title={t('Восстановить стандартные настройки')}>
          <RotateCcw size={15} /> {t('Сбросить')}
        </button>
      }
    >
      <div className="preview-card" aria-hidden="true">
        {/* Образец текста — Ин 3:16 в классическом переводе на языке интерфейса */}
        <span className="pv-num">16</span>
        {t('Ибо так возлюбил Бог мир, что отдал Сына Своего Единородного, дабы всякий верующий в Него, не погиб, но имел жизнь вечную.')}
        <span className="pv-xr">[⇅ 5]</span>
      </div>

      <section className="settings-group">
        <h4>{t('Тема')}</h4>
        <Segmented
          id="set-theme"
          value={s.theme}
          onChange={(theme) => set({ theme })}
          options={[
            ['light', t('Светлая')],
            ['dark', t('Тёмная')],
            ['sepia', t('Сепия')],
            ['auto', t('Как в системе')],
          ]}
        />
      </section>

      <section className="settings-group">
        <h4>
          {t('Вид текста')} <Hint>{t('«По стихам» — каждый стих с новой строки. «Сплошной» — стихи подряд, с номерами. «Как книга» — абзацами по разделам, без номеров и кнопок, для долгого чтения.')}</Hint>
        </h4>
        <Segmented
          id="set-view"
          value={textView(s)}
          onChange={(v) => set({ bookMode: v === 'book', continuousVerses: v === 'flow' })}
          options={[
            ['verses', t('По стихам')],
            ['flow', t('Сплошной')],
            ['book', t('Как книга')],
          ]}
        />
      </section>

      <section className="settings-group">
        <h4>{t('Текст')}</h4>
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
        <Switch id="set-vn" checked={s.showVerseNumbers} onChange={(showVerseNumbers) => set({ showVerseNumbers })} label={t('Номера стихов')} />
        <Switch id="set-head" checked={s.showHeadings} onChange={(showHeadings) => set({ showHeadings })} label={t('Заголовки разделов')} />
        <Switch id="set-strong" checked={s.showStrongs} onChange={(showStrongs) => set({ showStrongs })} label={t('Номера Стронга в тексте')} hint={t('Только для размеченных переводов, например RST+')} />
      </section>

      <section className="settings-group">
        <h4>{t('Интерфейс')}</h4>
        <Switch id="set-xr" checked={s.showXrefButtons} onChange={(showXrefButtons) => set({ showXrefButtons })} label={t('Кнопки параллельных мест')} />
        <Switch id="set-focus" checked={s.focusMode} onChange={(focusMode) => set({ focusMode })} label={t('Режим чтения')} hint={t('Прячет кнопки в тексте, панель скрывается при прокрутке вниз')} />
        <Switch id="set-anim" checked={s.animations} onChange={(animations) => set({ animations })} label={t('Анимации')} />
        <Slider id="set-radius" label={t('Закругления')} value={s.radius} min={0} max={24} step={1} onChange={(radius) => set({ radius })} format={(v) => `${v} px`} />
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
      </section>

      {commentaries.length > 0 && (
        <section className="settings-group">
          <h4>
            {t('Комментарии в тексте')} <Hint>{t('Отмеченные подписываются после стиха. Остальные открываются долгим нажатием на стих → «Комментарии».')}</Hint>
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
          {t('Цвета выделений')} <Hint>{t('Подпишите цвета — например, «Обетования», «Вопросы». Подписи видны в палитре и в списке выделений.')}</Hint>
        </h4>
        <div className="hl-labels">
          {HL_COLORS.map((c) => (
            <label key={c.id} className="hl-label-row" htmlFor={`hl-${c.id}`}>
              <span className="hl-swatch" style={{ background: c.css }} />
              <input id={`hl-${c.id}`} value={hlLabels[c.id] || ''} placeholder={t(c.name)} onChange={(e) => setHlLabels((l) => ({ ...l, [c.id]: e.target.value }))} autoComplete="off" />
            </label>
          ))}
        </div>
      </section>

      <section className="settings-group">
        <h4>{t('Свои цвета')}</h4>
        <Switch id="set-custom" checked={s.customColors} onChange={(v) => (v ? colorsFromTheme() : set({ customColors: false }))} label={t('Использовать свои цвета')} hint={t('Поверх выбранной темы')} />
        {s.customColors && (
          <div className="color-grid">
            <ColorField id="c-bg" label={t('Фон')} value={s.colors.bg} onChange={(bg) => set({ colors: { ...s.colors, bg } })} />
            <ColorField id="c-text" label={t('Текст')} value={s.colors.text} onChange={(text) => set({ colors: { ...s.colors, text } })} />
            <ColorField id="c-accent" label={t('Акцент')} value={s.colors.accent} onChange={(accent) => set({ colors: { ...s.colors, accent } })} />
            <ColorField id="c-panel" label={t('Панели')} value={s.colors.panel} onChange={(panel) => set({ colors: { ...s.colors, panel } })} />
          </div>
        )}
      </section>
    </BottomSheet>
  );
}
