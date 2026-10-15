// Интерактивная инструкция поверх приложения: экран затемнён, нужное место подсвечено мигающей рамкой,
// карточка с шагом — снизу (или сверху, если подсвеченное место внизу). Нажать можно саму подсвеченную
// кнопку — урок пойдёт дальше; «Далее» делает действие за человека.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { useApp } from '../App.jsx';
import { useTour, stopTour, goStep } from '../core/tour.js';
import { TOURS } from './tours.js';

const PAD = 6;
const stop = (e) => e.stopPropagation();

export default function TourOverlay() {
  const t = useTour();
  const app = useApp();
  const tour = TOURS.find((x) => x.id === t.id);
  const step = tour?.steps[t.step];
  const [rect, setRect] = useState(null);
  const moving = useRef(false);
  const api = {
    openSheet: (kind, payload) => app.openSheet(kind, 0, payload),
    closeSheet: app.closeSheet,
    reset() {
      app.closeSheet();
      app.closePopover();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    },
  };
  const apiRef = useRef(api);
  apiRef.current = api;

  const advance = (doAction) => {
    if (!step || moving.current) return;
    moving.current = true;
    if (doAction && step.next && !step.until?.()) step.next(apiRef.current);
    setTimeout(() => {
      moving.current = false;
      if (t.step + 1 >= tour.steps.length) stopTour();
      else goStep(t.step + 1);
    }, doAction && step.next ? 350 : 0);
  };
  const back = () => t.step > 0 && goStep(t.step - 1);

  // Вход в шаг: в начале урока — чистый экран, затем подготовка шага
  useEffect(() => {
    if (!step) return;
    moving.current = false;
    if (t.step === 0) apiRef.current.reset();
    const tm = setTimeout(() => step.before?.(apiRef.current), t.step === 0 ? 250 : 80);
    return () => clearTimeout(tm);
  }, [t.id, t.step]);

  // Следим за подсвеченным местом (окна выезжают, текст прокручивается) и за тем, не выполнен ли шаг сам
  useEffect(() => {
    if (!step) return;
    const wasDone = !!step.until?.();
    let scrolled = false;
    const tick = () => {
      const el = step.target?.() || null;
      if (!el) return setRect((r) => (r ? null : r));
      let r = el.getBoundingClientRect();
      if (!scrolled && (r.bottom < 60 || r.top > innerHeight - 60)) {
        scrolled = true;
        el.scrollIntoView({ block: 'center' });
        r = el.getBoundingClientRect();
      }
      const n = { l: Math.max(4, r.left - PAD), t: Math.max(4, r.top - PAD), r: Math.min(innerWidth - 4, r.right + PAD), b: Math.min(innerHeight - 4, r.bottom + PAD) };
      setRect((o) => (o && o.l === n.l && o.t === n.t && o.r === n.r && o.b === n.b ? o : n));
      if (!wasDone && step.until?.()) advance(false);
    };
    tick();
    const iv = setInterval(tick, 200);
    // Человек сам нажал на подсвеченное — шаг сделан
    const onClick = (e) => {
      const el = step.target?.();
      if (step.next && el && el.contains(e.target)) setTimeout(() => advance(false), 350);
    };
    document.addEventListener('click', onClick, true);
    return () => {
      clearInterval(iv);
      document.removeEventListener('click', onClick, true);
    };
  }, [t.id, t.step]);

  if (!step) return null;
  const last = t.step === tour.steps.length - 1;
  // Карточка там, где больше места: под подсвеченным или над ним
  const panelTop = rect ? rect.t > innerHeight - rect.b : false;
  const dim = (style) => <div className="tour-dim" style={style} onPointerDown={stop} onClick={stop} />;

  return createPortal(
    <div className="tour" role="dialog" aria-label={`Инструкция: ${tour.title}`}>
      {rect ? (
        <>
          {dim({ left: 0, top: 0, right: 0, height: rect.t })}
          {dim({ left: 0, top: rect.b, right: 0, bottom: 0 })}
          {dim({ left: 0, top: rect.t, width: rect.l, height: rect.b - rect.t })}
          {dim({ left: rect.r, top: rect.t, right: 0, height: rect.b - rect.t })}
          <div className="tour-ring" style={{ left: rect.l, top: rect.t, width: rect.r - rect.l, height: rect.b - rect.t }} />
        </>
      ) : (
        dim({ inset: 0 })
      )}
      <div className={`tour-card ${panelTop ? 'top' : 'bottom'}`} onPointerDown={stop}>
        <div className="tour-head">
          <span>
            {tour.title} · шаг {t.step + 1} из {tour.steps.length}
          </span>
          <button className="icon-btn" onClick={() => (apiRef.current.reset(), stopTour())} aria-label="Закончить инструкцию">
            <X size={20} />
          </button>
        </div>
        <p className="tour-text">{step.text}</p>
        <div className="tour-dots" aria-hidden="true">
          {tour.steps.map((_, i) => (
            <i key={i} className={i === t.step ? 'on' : i < t.step ? 'done' : ''} />
          ))}
        </div>
        <div className="tour-btns">
          {t.step > 0 && (
            <button className="btn" onClick={back}>
              <ChevronLeft size={18} /> Назад
            </button>
          )}
          <button className="btn primary" onClick={() => (last ? (apiRef.current.reset(), stopTour()) : advance(true))}>
            {last ? (
              <>
                <Check size={18} /> Понятно
              </>
            ) : (
              <>
                Далее <ChevronRight size={18} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
