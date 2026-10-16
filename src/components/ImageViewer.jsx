// Просмотр иллюстрации к стиху во весь экран: увеличение двумя пальцами и нажатием,
// перетаскивание увеличенной картинки, переключение между картинками стиха, подпись с автором и лицензией.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut, ExternalLink } from 'lucide-react';
import { formatRef } from '../core/books.js';

const MAX_SCALE = 5;
const TAP_SCALE = 2.5;

function Zoomable({ item, onSwipe }) {
  const box = useRef(null);
  const [t, setT] = useState({ s: 1, x: 0, y: 0 });
  const [state, setState] = useState('loading'); // loading | ok | error
  const pts = useRef(new Map());
  const g = useRef(null); // начало жеста
  const tap = useRef(null); // для отличия нажатия от перетаскивания
  const cur = useRef(t);
  cur.current = t;

  useEffect(() => {
    setT({ s: 1, x: 0, y: 0 });
    setState('loading');
  }, [item.img]);

  // Не даём увести картинку за край, когда она увеличена
  const clamp = (s, x, y) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || s <= 1) return { s: Math.max(1, s), x: 0, y: 0 };
    const mx = (r.width * (s - 1)) / 2;
    const my = (r.height * (s - 1)) / 2;
    return { s, x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) };
  };
  // Увеличить вокруг точки (cx, cy) экрана
  const zoomAt = (s, cx, cy) => {
    const r = box.current.getBoundingClientRect();
    const { s: s0, x: x0, y: y0 } = cur.current;
    const px = cx - (r.left + r.width / 2);
    const py = cy - (r.top + r.height / 2);
    const k = s / s0;
    setT(clamp(s, px - (px - x0) * k, py - (py - y0) * k));
  };

  const onDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const list = [...pts.current.values()];
    if (list.length === 1) tap.current = { x: e.clientX, y: e.clientY, at: Date.now() };
    else tap.current = null;
    g.current = { list: list.map((p) => ({ ...p })), t: { ...cur.current } };
  };
  const onMove = (e) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const list = [...pts.current.values()];
    const st = g.current;
    if (!st) return;
    if (tap.current && Math.hypot(e.clientX - tap.current.x, e.clientY - tap.current.y) > 8) tap.current = null;
    if (list.length >= 2 && st.list.length >= 2) {
      // Два пальца: масштаб по расстоянию, сдвиг по середине
      const d0 = Math.hypot(st.list[0].x - st.list[1].x, st.list[0].y - st.list[1].y) || 1;
      const d1 = Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y);
      const s = Math.max(1, Math.min(MAX_SCALE, st.t.s * (d1 / d0)));
      const m0 = { x: (st.list[0].x + st.list[1].x) / 2, y: (st.list[0].y + st.list[1].y) / 2 };
      const m1 = { x: (list[0].x + list[1].x) / 2, y: (list[0].y + list[1].y) / 2 };
      const r = box.current.getBoundingClientRect();
      const px = m0.x - (r.left + r.width / 2);
      const py = m0.y - (r.top + r.height / 2);
      const k = s / st.t.s;
      setT(clamp(s, px - (px - st.t.x) * k + (m1.x - m0.x), py - (py - st.t.y) * k + (m1.y - m0.y)));
    } else if (list.length === 1 && st.t.s > 1) {
      // Один палец по увеличенной картинке — двигаем её
      setT(clamp(st.t.s, st.t.x + (list[0].x - st.list[0].x), st.t.y + (list[0].y - st.list[0].y)));
    }
  };
  const onUp = (e) => {
    const was = g.current;
    pts.current.delete(e.pointerId);
    const list = [...pts.current.values()];
    g.current = list.length ? { list: list.map((p) => ({ ...p })), t: { ...cur.current } } : null;
    if (list.length) return;
    // Короткое нажатие: увеличить в этом месте, повторное — вернуть как было
    if (tap.current && Date.now() - tap.current.at < 350) {
      if (cur.current.s > 1.05) setT({ s: 1, x: 0, y: 0 });
      else zoomAt(TAP_SCALE, e.clientX, e.clientY);
    } else if (was && was.t.s <= 1.02 && was.list.length === 1) {
      // Смахивание при обычном размере — к соседней картинке
      const dx = e.clientX - was.list[0].x;
      if (Math.abs(dx) > 60) onSwipe?.(dx < 0 ? 1 : -1);
    }
    tap.current = null;
  };

  return (
    <div className="iv-stage" ref={box} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {state === 'loading' && (
        <div className="iv-status">
          <Loader2 className="spin" size={28} />
        </div>
      )}
      {state === 'error' && <div className="iv-status">Картинка не загрузилась. Проверьте интернет.</div>}
      <img
        src={item.img}
        alt={item.title || ''}
        draggable={false}
        onLoad={() => setState('ok')}
        onError={() => setState('error')}
        style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`, opacity: state === 'ok' ? 1 : 0 }}
      />
      <div className="iv-zoom">
        <button className="iv-btn" onClick={() => setT(clamp(Math.max(1, cur.current.s / 1.6), cur.current.x, cur.current.y))} aria-label="Уменьшить" disabled={t.s <= 1}>
          <ZoomOut size={20} />
        </button>
        <button
          className="iv-btn"
          onClick={() => {
            const r = box.current.getBoundingClientRect();
            zoomAt(Math.min(MAX_SCALE, cur.current.s * 1.6), r.left + r.width / 2, r.top + r.height / 2);
          }}
          aria-label="Увеличить"
          disabled={t.s >= MAX_SCALE}
        >
          <ZoomIn size={20} />
        </button>
      </div>
    </div>
  );
}

export default function ImageViewer({ payload, onClose }) {
  const items = payload.items || [];
  const [i, setI] = useState(0);
  const item = items[i];
  const go = (d) => setI((x) => Math.max(0, Math.min(items.length - 1, x + d)));
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!item) return null;
  return createPortal(
    <div className="iv" role="dialog" aria-label={`Иллюстрация к ${payload.ref ? formatRef(payload.ref) : 'стиху'}`}>
      <div className="iv-top">
        <span className="iv-ref">{payload.ref ? formatRef(payload.ref) : ''}</span>
        {items.length > 1 && (
          <span className="iv-count">
            {i + 1} из {items.length}
          </span>
        )}
        <button className="iv-btn" onClick={onClose} aria-label="Закрыть">
          <X size={22} />
        </button>
      </div>
      <Zoomable key={item.img} item={item} onSwipe={go} />
      {items.length > 1 && (
        <>
          <button className="iv-btn iv-prev" onClick={() => go(-1)} disabled={i === 0} aria-label="Предыдущая картинка">
            <ChevronLeft size={26} />
          </button>
          <button className="iv-btn iv-next" onClick={() => go(1)} disabled={i === items.length - 1} aria-label="Следующая картинка">
            <ChevronRight size={26} />
          </button>
        </>
      )}
      <div className="iv-caption">
        {item.title && <strong>{item.title}</strong>}
        <span>
          {[item.author, item.year].filter(Boolean).join(', ')}
          {item.license ? ` · ${item.license}` : ''}
          {item.src && (
            <>
              {' · '}
              <a href={item.src} target="_blank" rel="noopener noreferrer">
                источник <ExternalLink size={12} />
              </a>
            </>
          )}
        </span>
        <small>Нажмите на картинку, чтобы увеличить; двумя пальцами — плавно.</small>
      </div>
    </div>,
    document.body
  );
}
