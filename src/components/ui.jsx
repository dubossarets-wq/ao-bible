// Общие мелкие элементы интерфейса.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

// Бегунок переключателя можно тянуть пальцем или мышью (по всей строке): он едет за пальцем,
// а когда отпускают — встаёт в ближайшее положение. Вертикальная прокрутка не мешает: тянем, только если движение вбок.
const THUMB = 18; // ход бегунка, px
export function useSwipeToggle(checked, onChange) {
  const st = useRef(null);
  const dragged = useRef(false);
  const end = () => {
    const s = st.current;
    st.current = null;
    if (!s?.drag) return;
    dragged.current = true;
    setTimeout(() => (dragged.current = false), 400);
    s.track.classList.remove('dragging');
    s.track.style.removeProperty('--thumb');
    const next = s.pos > THUMB / 2;
    if (next !== !!checked) onChange(next);
  };
  return {
    onPointerDown: (e) => {
      if (e.button > 0) return;
      const track = e.currentTarget.querySelector('.switch');
      st.current = track ? { x: e.clientX, y: e.clientY, id: e.pointerId, el: e.currentTarget, track, drag: false, pos: checked ? THUMB : 0 } : null;
    },
    onPointerMove: (e) => {
      const s = st.current;
      if (!s) return;
      const dx = e.clientX - s.x;
      if (!s.drag) {
        if (Math.abs(dx) < 5) return;
        if (Math.abs(e.clientY - s.y) > Math.abs(dx)) return void (st.current = null);
        s.drag = true;
        s.el.setPointerCapture?.(s.id);
        s.track.classList.add('dragging');
      }
      s.pos = Math.max(0, Math.min(THUMB, (checked ? THUMB : 0) + dx));
      s.track.style.setProperty('--thumb', `${s.pos}px`);
    },
    onPointerUp: end,
    onPointerCancel: end,
    // После перетаскивания щелчок не должен переключать ещё раз
    onClickCapture: (e) => {
      if (!dragged.current) return;
      dragged.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };
}

export function Switch({ id, checked, onChange, label, hint }) {
  const swipe = useSwipeToggle(checked, onChange);
  return (
    <label className="field switch-field" htmlFor={id} {...swipe}>
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

// Выбор из нескольких вариантов: подложка плавно переезжает к выбранному;
// можно провести пальцем по вариантам — подложка едет следом, выбор — там, где отпустили.
export function Segmented({ value, options, onChange, label, id }) {
  const box = useRef(null);
  const [preview, setPreview] = useState(null);
  const [pill, setPill] = useState(null);
  const [, remeasure] = useState(0);
  const shown = preview ?? value;
  const idx = options.findIndex(([v]) => v === shown);
  useLayoutEffect(() => {
    const b = box.current?.querySelector(`button[data-i="${idx}"]`);
    const next = b ? { left: b.offsetLeft, top: b.offsetTop, width: b.offsetWidth, height: b.offsetHeight } : null;
    setPill((cur) => (cur && next && cur.left === next.left && cur.top === next.top && cur.width === next.width && cur.height === next.height ? cur : next));
  });
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(() => remeasure((x) => x + 1));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  // Первое появление — без анимации, дальше подложка ездит
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const drag = useRef(null);
  const dragged = useRef(false);
  const pick = (e) => {
    const b = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('button[data-i]');
    if (b && box.current?.contains(b)) setPreview(options[+b.dataset.i][0]);
  };
  const end = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.active) return;
    dragged.current = true;
    setTimeout(() => (dragged.current = false), 400);
    box.current?.classList.remove('dragging');
    setPreview((p) => {
      if (p != null && p !== value) onChange(p);
      return null;
    });
  };
  return (
    <div className="field seg-field" role="group" aria-labelledby={id}>
      {label && (
        <span className="field-label" id={id}>
          {label}
        </span>
      )}
      <div
        className={`segmented${ready ? ' ready' : ''}`}
        ref={box}
        onPointerDown={(e) => {
          if (e.button > 0) return;
          drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, active: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          if (!d.active) {
            const dx = e.clientX - d.x;
            if (Math.abs(dx) < 6) return;
            if (Math.abs(e.clientY - d.y) > Math.abs(dx)) return void (drag.current = null);
            d.active = true;
            box.current.setPointerCapture?.(d.id);
            box.current.classList.add('dragging');
          }
          pick(e);
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onClickCapture={(e) => {
          if (!dragged.current) return;
          dragged.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {pill && <span className="seg-pill" aria-hidden="true" style={{ transform: `translate(${pill.left}px, ${pill.top}px)`, width: pill.width, height: pill.height }} />}
        {options.map(([v, l], i) => (
          <button key={v} data-i={i} type="button" className={v === shown ? 'on' : ''} aria-pressed={v === value} onClick={() => onChange(v)}>
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
