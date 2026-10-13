// Быстрое переключение перевода в панели: книга, глава и стих сохраняются.
import React from 'react';
import { Check, Library, Star } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';

export default function ModulePicker({ pane, onClose }) {
  const { bibles, panes, setPaneModule, openSheet, settings, setSettings } = useApp();
  const current = panes[pane]?.moduleId;
  return (
    <BottomSheet title="Перевод" subtitle={pane === 1 ? 'Вторая панель' : 'Основная панель'} onClose={onClose} initial={0}>
      <ul className="pick-list">
        {bibles.map((b) => (
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
                {b.features?.strongs ? ' · номера Стронга' : ''}
              </span>
              {b.id === current && <Check size={18} className="pick-check" />}
            </button>
            {settings.primaryModule !== b.id ? (
              <button className="icon-btn subtle" title="Сделать основным переводом" aria-label={`Сделать ${b.name} основным переводом`} onClick={() => setSettings({ primaryModule: b.id })}>
                <Star size={16} />
              </button>
            ) : (
              <span className="icon-btn subtle on" title="Основной перевод" aria-label="Основной перевод">
                <Star size={16} fill="currentColor" />
              </span>
            )}
          </li>
        ))}
      </ul>
      <button className="btn wide" onClick={() => openSheet('library', pane, { tab: 'catalog' })}>
        <Library size={16} /> Установить другие переводы
      </button>
    </BottomSheet>
  );
}
