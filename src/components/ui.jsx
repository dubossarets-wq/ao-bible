// Общие мелкие элементы интерфейса.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert } from 'lucide-react';

export function Toasts({ items }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Progress({ value, label }) {
  return (
    <div className="progress">
      <div className="progress-track">
        <div className="progress-bar" style={{ width: `${Math.round((value || 0) * 100)}%` }} />
      </div>
      {label && <div className="progress-label">{label}</div>}
    </div>
  );
}

// Пояснение к настройке: значок «!» в кружке рядом с названием. Текст — во всплывающем облачке
// поверх содержимого (ничего не сдвигает); закрывается повторным нажатием, нажатием мимо, прокруткой, Esc.
export function Hint({ children, label = 'Пояснение' }) {
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const pop = useRef(null);
  useEffect(() => {
    if (!pos) return;
    const openedAt = Date.now();
    const close = (e) => {
      if (e?.type === 'pointerdown' && (pop.current?.contains(e.target) || btn.current?.contains(e.target))) return;
      // Сразу после открытия браузер может подкрутить окно к кнопке — эту прокрутку не считаем
      if (e?.type === 'scroll' && Date.now() - openedAt < 300) return;
      setPos(null);
    };
    const esc = (e) => e.key === 'Escape' && (e.stopPropagation(), setPos(null));
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('pointerdown', close, true);
      document.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', esc, true);
    };
  }, [pos]);
  const toggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (pos) return setPos(null);
    const r = btn.current.getBoundingClientRect();
    const w = Math.min(280, window.innerWidth - 24);
    const left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2));
    const below = r.bottom + 160 < (window.visualViewport?.height || window.innerHeight);
    setPos({ left, width: w, top: below ? r.bottom + 8 : null, bottom: below ? null : window.innerHeight - r.top + 8, arrow: r.left + r.width / 2 - left, below });
  };
  return (
    <>
      <button ref={btn} type="button" className={`hint-btn ${pos ? 'on' : ''}`} aria-label={label} aria-expanded={!!pos} onClick={toggle}>
        <CircleAlert size={15} />
      </button>
      {pos &&
        createPortal(
          <span
            ref={pop}
            className={`hint-pop ${pos.below ? 'below' : 'above'}`}
            role="tooltip"
            style={{ left: pos.left, width: pos.width, top: pos.top ?? 'auto', bottom: pos.bottom ?? 'auto', '--arrow': `${pos.arrow}px` }}
          >
            {children}
          </span>,
          document.body
        )}
    </>
  );
}

export function Switch({ id, checked, onChange, label, hint }) {
  return (
    <label className="field switch-field" htmlFor={id}>
      <span className="field-text">
        <span className="field-label">
          {label}
          {hint && <Hint>{hint}</Hint>}
        </span>
      </span>
      <input id={id} type="checkbox" role="switch" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}

export function Segmented({ value, options, onChange, label, id }) {
  return (
    <div className="field seg-field" role="group" aria-labelledby={id}>
      {label && (
        <span className="field-label" id={id}>
          {label}
        </span>
      )}
      <div className="segmented">
        {options.map(([v, l]) => (
          <button key={v} type="button" className={v === value ? 'on' : ''} aria-pressed={v === value} onClick={() => onChange(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Slider({ id, label, value, min, max, step, onChange, format = (v) => v }) {
  return (
    <label className="field slider-field" htmlFor={id}>
      <span className="field-row">
        <span className="field-label">{label}</span>
        <span className="field-value">{format(value)}</span>
      </span>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </label>
  );
}

// Подтверждение прямо в интерфейсе (confirm() в артефакте не работает)
export function ConfirmButton({ children, confirmText = 'Точно?', onConfirm, className = 'btn', ...rest }) {
  const [armed, setArmed] = useState(false);
  return armed ? (
    <span className="confirm-group">
      <button className="btn danger" onClick={() => (setArmed(false), onConfirm())}>
        {confirmText}
      </button>
      <button className="btn" onClick={() => setArmed(false)}>
        Отмена
      </button>
    </span>
  ) : (
    <button className={className} onClick={() => setArmed(true)} {...rest}>
      {children}
    </button>
  );
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="empty">
      {Icon && <Icon size={28} strokeWidth={1.5} />}
      <div className="empty-title">{title}</div>
      {children && <div className="empty-text">{children}</div>}
    </div>
  );
}

export const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} МБ` : `${Math.max(1, Math.round(b / 1024))} КБ`);
