// Приветствие при первом запуске: три коротких шага — удобный размер букв, долгое нажатие на стих, нажатие на слово.
// Показывается один раз и только новому человеку (тем, кто уже пользовался приложением, — нет).
import React, { useEffect, useState } from 'react';
import { Type, Hand, BookA } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { Sample } from './AppearanceSettings.jsx';
import { Slider } from './ui.jsx';
import { useApp } from '../App.jsx';
import { save } from '../core/storage.js';
import { t, N_ } from '../core/i18n.js';

const STEPS = [
  {
    icon: Type,
    title: N_('Удобный размер букв'),
    text: N_('Подберите размер, чтобы читать было легко. Поменять его можно в «Оформлении» или двумя пальцами прямо на тексте.'),
  },
  {
    icon: Hand,
    title: N_('Зажмите стих'),
    text: N_('Откроются действия: цвет, заметка, закладка, копировать, поделиться, подстрочник, комментарии.'),
  },
  {
    icon: BookA,
    title: N_('Нажмите на слово'),
    text: N_('Увидите слово оригинала на иврите или греческом и его значение по словарю Стронга.'),
  },
];

export default function Welcome({ onClose }) {
  const { settings: s, setSettings: set, openSheet } = useApp();
  const [i, setI] = useState(0);
  useEffect(() => save('welcomePending', false), []);
  const step = STEPS[i];
  const Icon = step.icon;
  const last = i === STEPS.length - 1;
  return (
    <BottomSheet
      title={t('Добро пожаловать')}
      subtitle={t('Шаг {n} из {total}', { n: i + 1, total: STEPS.length })}
      onClose={onClose}
      initial={2}
      footer={
        <div className="row-actions welcome-actions">
          {i > 0 ? (
            <button className="btn" onClick={() => setI(i - 1)}>
              {t('Назад')}
            </button>
          ) : (
            <button className="btn" onClick={onClose}>
              {t('Пропустить')}
            </button>
          )}
          <button className="btn primary" onClick={() => (last ? onClose() : setI(i + 1))}>
            {last ? t('Начать чтение') : t('Далее')}
          </button>
        </div>
      }
    >
      <div className="welcome-step">
        <Icon size={40} strokeWidth={1.5} className="welcome-icon" aria-hidden="true" />
        <h3>{t(step.title)}</h3>
        <p>{t(step.text)}</p>
        {i === 0 && (
          <>
            <Slider id="welcome-size" label={t('Размер шрифта')} value={s.fontSize} min={13} max={40} step={1} onChange={(fontSize) => set({ fontSize })} format={(v) => `${v} px`} />
            <Sample s={s} head />
          </>
        )}
        <div className="welcome-dots" aria-hidden="true">
          {STEPS.map((_, k) => (
            <span key={k} className={k === i ? 'on' : ''} />
          ))}
        </div>
        {last && (
          <button className="btn small btn-block" onClick={() => openSheet('help')}>
            {t('Открыть инструкцию')}
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
