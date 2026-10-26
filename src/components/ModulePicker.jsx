// Быстрое переключение перевода в панели: книга, глава и стих сохраняются.
import React, { useState } from 'react';
import { Library, Star } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { t, getLang, locale } from '../core/i18n.js';

export default function ModulePicker({ pane, onClose }) {
  const { bibles, panes, setPaneModule, openSheet, settings, setSettings } = useApp();
  const current = panes[pane]?.moduleId;
  // основной (избранный ★) — первым, остальные в прежнем порядке, подстрочники — всегда внизу;
  // открытый сейчас — отмечен фоном (.pick-row.on)
  const ordered = [...bibles.filter((b) => b.id === settings.primaryModule), ...bibles.filter((b) => b.id !== settings.primaryModule)];
  const sorted = [...ordered.filter((b) => !b.features?.interlinear), ...ordered.filter((b) => b.features?.interlinear)];
  // выборка по языкам сверху — если переводы на разных языках; язык приложения — первым
  const [lang, setLang] = useState(null);
  const langs = [...new Set(sorted.map((b) => b.language || 'ru'))].sort((a, b) => (a === getLang() ? -1 : b === getLang() ? 1 : 0));
  const shown = langs.includes(lang) ? lang : null;
  const list = shown ? sorted.filter((b) => (b.language || 'ru') === shown) : sorted;
  let names = null;
  try {
    names = new Intl.DisplayNames([locale()], { type: 'language' });
  } catch {}
  const langName = (code) => {
    const n = (names && names.of(code)) || code;
    return n.charAt(0).toUpperCase() + n.slice(1);
  };
  return (
    <BottomSheet title={t('Перевод')} subtitle={pane === 1 ? t('Вторая панель') : t('Основная панель')} onClose={onClose}>
      {langs.length > 1 && (
        <div className="pick-langs" role="group" aria-label={t('Язык')}>
          <button type="button" className={`chip ${!shown ? 'on' : ''}`} aria-pressed={!shown} onClick={() => setLang(null)}>
            {t('Все')}
          </button>
          {langs.map((l) => (
            <button key={l} type="button" className={`chip ${shown === l ? 'on' : ''}`} aria-pressed={shown === l} onClick={() => setLang(l)}>
              {langName(l)}
            </button>
          ))}
        </div>
      )}
      <ul className="pick-list">
        {list.map((b) => (
          <li key={b.id}>
            <button
              className={`pick-row ${b.id === current ? 'on' : ''}`}
              onClick={() => {
                setPaneModule(pane, b.id);
                onClose();
              }}
            >
              <span className="pick-name">{b.name}</span>
              <span className="pick-desc">
                {b.title}
                {b.features?.strongs ? ` · ${t('номера Стронга')}` : ''}
              </span>
            </button>
            {settings.primaryModule !== b.id ? (
              <button className="icon-btn subtle" title={t('Сделать основным')} aria-label={t('Сделать {name} основным переводом', { name: b.name })} onClick={() => setSettings({ primaryModule: b.id })}>
                <Star size={16} />
              </button>
            ) : (
              <span className="icon-btn subtle on" title={t('Основной перевод')} aria-label={t('Основной перевод')}>
                <Star size={16} fill="currentColor" />
              </span>
            )}
          </li>
        ))}
      </ul>
      <button className="btn wide" onClick={() => openSheet('library', pane, { tab: 'catalog' })}>
        <Library size={16} /> {t('Другие переводы')}
      </button>
    </BottomSheet>
  );
}
