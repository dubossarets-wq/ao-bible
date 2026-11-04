// Выбор языка над списком переводов: «Все», затем первые языки кнопками (свои и самые большие),
// остальные (их сотни — каталог bible.helloao.org) — в выпадающем списке «Ещё языки» по алфавиту.
// Выбранный из списка язык встаёт кнопкой рядом, чтобы было видно, что он включён.
import React, { useMemo } from 'react';
import { t, locale } from '../core/i18n.js';
import { langName } from './ModuleLibrary.jsx'; // взаимный импорт: функции нужны только при показе

export default function LangChips({ codes, value, onChange, counts, allValue = null, allLabel, max = 8, className = 'pick-langs', label }) {
  const head = codes.slice(0, max);
  const rest = codes.slice(max);
  const extra = value != null && value !== allValue && !head.includes(value) ? [value] : [];
  // по алфавиту — одним Intl.Collator (localeCompare на каждое сравнение создавал бы его заново)
  const sorted = useMemo(() => {
    const coll = new Intl.Collator(locale());
    return rest.map((c) => [c, langName(c)]).sort((a, b) => coll.compare(a[1], b[1])).map(([c]) => c);
  }, [rest.join(',')]);
  const chip = (k, text) => (
    <button key={k ?? '*'} type="button" className={`chip ${value === k ? 'on' : ''}`} aria-pressed={value === k} onClick={() => onChange(k)}>
      {text}
      {counts && k !== allValue && counts[k] ? <span className="tab-n"> {counts[k]}</span> : null}
    </button>
  );
  return (
    <div className={className} role="group" aria-label={label || t('Язык')}>
      {chip(allValue, allLabel || t('Все'))}
      {[...head, ...extra].map((c) => chip(c, langName(c)))}
      {rest.length > 0 && (
        <label className="chip chip-select">
          <span>{t('Ещё языки')}</span>
          <span className="tab-n"> {rest.length}</span>
          <select value="" onChange={(e) => e.target.value && onChange(e.target.value)} aria-label={t('Ещё языки')}>
            <option value="">{t('Ещё языки')}</option>
            {sorted.map((c) => (
              <option key={c} value={c}>
                {langName(c)}
                {counts?.[c] ? ` · ${counts[c]}` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
