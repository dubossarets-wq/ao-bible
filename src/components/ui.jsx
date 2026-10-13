// Общие мелкие элементы интерфейса.
import React, { useState } from 'react';

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

export function Switch({ id, checked, onChange, label, hint }) {
  return (
    <label className="field switch-field" htmlFor={id}>
      <span className="field-text">
        <span className="field-label">{label}</span>
        {hint && <span className="field-hint">{hint}</span>}
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
