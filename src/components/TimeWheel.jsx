// Выбор времени колёсиками, как в будильнике iPhone: часы и минуты крутятся по кругу, выбранное — в полосе
// посередине. Колонка — прокрутка с привязкой к строкам; значения повторены несколько раз, и после остановки
// колонка незаметно возвращается к средней копии, так что крутить можно бесконечно в обе стороны
import React, { useLayoutEffect, useRef } from 'react';
import { t } from '../core/i18n.js';

const ITEM = 36; // высота строки
const LOOPS = 9; // сколько раз повторены значения
const pad2 = (n) => String(n).padStart(2, '0');

function WheelCol({ n, value, onChange, label }) {
  const ref = useRef(null);
  const timer = useRef(0);
  const mid = Math.floor(LOOPS / 2) * n;
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = (mid + value) * ITEM;
    return () => clearTimeout(timer.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // после остановки: значение — у строки в полосе; колонку — обратно к средней копии
  const settle = () => {
    const el = ref.current;
    if (!el) return;
    const v = (((Math.round(el.scrollTop / ITEM)) % n) + n) % n;
    const want = (mid + v) * ITEM;
    if (Math.abs(el.scrollTop - want) >= ITEM * n) el.scrollTop = want;
    if (v !== value) onChange(v);
  };
  const onScroll = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(settle, 150);
  };
  const step = (d) => ref.current?.scrollBy({ top: d * ITEM, behavior: 'smooth' });
  return (
    <div
      ref={ref}
      className="tw-col"
      onScroll={onScroll}
      role="spinbutton"
      tabIndex={0}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={n - 1}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          step(e.key === 'ArrowUp' ? -1 : 1);
        }
      }}
    >
      <div className="tw-pad" />
      {Array.from({ length: n * LOOPS }, (_, i) => (
        <div key={i} className="tw-item" onClick={() => ref.current?.scrollTo({ top: i * ITEM, behavior: 'smooth' })}>
          {pad2(i % n)}
        </div>
      ))}
      <div className="tw-pad" />
    </div>
  );
}

/** value — «ЧЧ:ММ»; onChange получает новое «ЧЧ:ММ» после остановки колёсика */
export default function TimeWheel({ value, onChange }) {
  const [h, m] = value.split(':').map((x) => +x || 0);
  return (
    <div className="tw">
      <WheelCol n={24} value={h} label={t('Часы')} onChange={(v) => onChange(`${pad2(v)}:${pad2(m)}`)} />
      <span className="tw-colon">:</span>
      <WheelCol n={60} value={m} label={t('Минуты')} onChange={(v) => onChange(`${pad2(h)}:${pad2(v)}`)} />
    </div>
  );
}
